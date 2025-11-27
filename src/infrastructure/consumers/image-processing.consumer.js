import rabbitmqService from '../services/rabbitmq.service.js';
import processImageUseCase from '../../application/use-cases/process-image-from-event.usecase.js';
import config from '../config/env.js';
import { logger } from '../logger/pino.config.js';
import {
  rabbitmqMessagesConsumed,
  rabbitmqMessageRetries,
  rabbitmqMessagesToDLQ,
  rabbitmqActiveConsumers,
  rabbitmqConsumerLag,
  rabbitmqErrorsTotal,
} from '../metrics/rabbitmq.metrics.js';

class ImageProcessingConsumer {
  #channel;
  #MAX_RETRIES = config.retry.maxRetries || 3;
  #EXCHANGE_NAME = config.rabbitmq.exchange || 'pixpro.processing';

  constructor() {
    this.rabbitmqService = rabbitmqService;
    this.processImageUseCase = processImageUseCase;
  }

  async start() {
    this.#channel = this.rabbitmqService.getChannel();

    // Consume from ALL 3 partition queues in parallel
    const partitions = [0, 1, 2];

    logger.info({
      event: 'consumer.startup.started',
      partitions,
      prefetchCount: config.processing.prefetchCount
    }, 'Starting consumer for partitioned queues...');

    for (const partition of partitions) {
      const queueName = `image.processing.partition.${partition}`;

      // One message per worker for better load distribution
      await this.#channel.prefetch(config.processing.prefetchCount);

      logger.info({
        event: 'consumer.partition.configured',
        partition,
        queueName,
        prefetchCount: config.processing.prefetchCount
      }, `[Partition ${partition}] Queue configured: ${queueName}`);

      // Start consuming from this partition queue
      await this.#consumeFromQueue(queueName);
    }

    logger.info({
      event: 'consumer.startup.completed',
      partitions,
      status: 'ready'
    }, 'Consumer started for all partitions');
  }

  async #consumeFromQueue(queueName) {
    // Extract partition number from queue name
    const partitionMatch = queueName.match(/partition\.(\d+)/);
    const partition = partitionMatch ? partitionMatch[1] : 'unknown';

    await this.#channel.consume(
      queueName,
      (message) => this.#handleReceivedMessage(message, queueName),
      { noAck: false }
    );

    logger.info({
      event: 'consumer.queue.listening',
      queueName,
      partition
    }, `[Consumer] Listening on queue: ${queueName}`);
  }

  async #handleReceivedMessage(message, queueName) {
    if (!message) return;

    const retryCount = message.properties.headers?.['x-retry-count'] || 0;
    const partition = message.properties.headers?.['x-partition'];

    const messageLogger = logger.child({
      messageId: message.properties.messageId,
      correlationId: message.properties.correlationId,
      deliveryTag: message.fields.deliveryTag,
      queueName,
      partition,
      retryCount
    });

    // Increment active consumers gauge for this partition
    rabbitmqActiveConsumers.inc({ partition: String(partition) });

    messageLogger.debug({
      event: 'rabbitmq.message.received',
      routingKey: message.fields.routingKey,
      exchange: message.fields.exchange,
      redelivered: message.fields.redelivered
    }, 'Received message from RabbitMQ');

    let event;

    try {
      event = JSON.parse(message.content.toString());
      const { eventId, payload } = event;

      messageLogger.info({
        event: 'event.processing.started',
        eventType: event.eventType,
        eventId,
        imageId: payload.imageId,
        userId: payload.userId,
        retryCount,
        maxRetries: this.#MAX_RETRIES
      }, `[${queueName}] Processing imageId: ${payload.imageId} (retry: ${retryCount}/${this.#MAX_RETRIES})`);

      // Execute use case
      const result = await this.processImageUseCase.execute(payload);

      // Publish success event
      await this.#publishEvent('ImageProcessed', {
        ...result,
        imageId: payload.imageId,
        userId: payload.userId
      });

      // Calculate consumer lag if timestamp is available
      if (message.properties.timestamp) {
        const lag = (Date.now() - message.properties.timestamp) / 1000;
        rabbitmqConsumerLag.observe({ partition: String(partition) }, lag);
      }

      // Acknowledge message on success
      this.#channel.ack(message);

      // Record success metrics
      rabbitmqMessagesConsumed.inc({
        event_type: 'ImageUploaded',
        status: 'success',
        partition: String(partition)
      });

      messageLogger.info({
        event: 'rabbitmq.message.acked',
        imageId: payload.imageId,
        processingTime: result.processingTime
      }, `[${queueName}] ✓ Completed: ${payload.imageId}`);

    } catch (error) {
      // Handle error with retry logic
      const parsedEvent = event || JSON.parse(message.content.toString());
      const isRetryable = this.#isRetryableError(error);

      messageLogger.error({
        event: 'event.processing.failed',
        error: {
          type: error.constructor?.name || 'Error',
          message: error.message,
          code: error.code,
          stack: error.stack
        },
        imageId: parsedEvent.payload?.imageId,
        isRetryable,
        retryCount
      }, `Error processing image: ${error.message}`);

      if (isRetryable && retryCount < this.#MAX_RETRIES) {
        // Retry with backoff
        const delay = this.#calculateBackoff(retryCount);

        messageLogger.warn({
          event: 'message.retry.scheduled',
          retryCount: retryCount + 1,
          maxRetries: this.#MAX_RETRIES,
          delayMs: delay,
          imageId: parsedEvent.payload?.imageId
        }, `[Retry ${retryCount + 1}/${this.#MAX_RETRIES}] Requeuing after ${delay}ms`);

        await this.#requeueWithDelay(parsedEvent, partition, retryCount + 1, delay);
        this.#channel.ack(message); // ACK original

        // Record retry metrics
        rabbitmqMessageRetries.inc({
          partition: String(partition),
          retry_count: String(retryCount + 1)
        });
        rabbitmqMessagesConsumed.inc({
          event_type: 'ImageUploaded',
          status: 'retry',
          partition: String(partition)
        });

      } else {
        // Max retries exceeded or non-retryable error -> DLQ
        messageLogger.error({
          event: 'message.moved_to_dlq',
          reason: isRetryable ? 'max_retries_exceeded' : 'non_retryable_error',
          retryCount,
          imageId: parsedEvent.payload?.imageId,
          errorMessage: error.message
        }, `[DLQ] Message failed after ${retryCount} retries: ${error.message}`);

        // Publish error event
        await this.#publishEvent('image.failed', {
          imageId: parsedEvent.payload?.imageId,
          error: error.message,
          errorCode: this.#determineErrorCode(error),
          retryCount: retryCount,
          timestamp: new Date().toISOString(),
          userId: parsedEvent.payload?.userId,
        });

        const dlqReason = isRetryable ? 'max_retries_exceeded' : 'non_retryable_error';

        // Record DLQ metrics
        rabbitmqMessagesToDLQ.inc({
          partition: String(partition),
          reason: dlqReason
        });
        rabbitmqMessagesConsumed.inc({
          event_type: 'ImageUploaded',
          status: 'dlq',
          partition: String(partition)
        });
        rabbitmqErrorsTotal.inc({
          error_type: error.constructor?.name || 'ProcessingError',
          operation: 'consume'
        });

        // NACK without requeue -> goes to DLQ via DLX
        this.#channel.nack(message, false, false);

        messageLogger.info({
          event: 'rabbitmq.message.nacked',
          imageId: parsedEvent.payload?.imageId
        }, 'Message NACK\'ed and sent to DLQ');
      }
    } finally {
      // Decrement active consumers gauge
      rabbitmqActiveConsumers.dec({ partition: String(partition) });
    }
  }

  #isRetryableError(error) {
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'RATE_LIMIT_EXCEEDED',
      'CLOUDINARY_TIMEOUT',
      'GEMINI_TIMEOUT',
      'PROCESSING_TIMEOUT'
    ];

    return retryableErrors.some(code =>
      error.message.includes(code) || error.code === code
    );
  }

  #calculateBackoff(retryCount) {
    const delays = [
      config.retry.delay1 || 5000,
      config.retry.delay2 || 15000,
      config.retry.delay3 || 30000
    ];
    return delays[retryCount] || 30000;
  }

  async #requeueWithDelay(event, partition, newRetryCount, delay) {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          const routingKey = `image.uploaded.partition.${partition}`;

          await this.#channel.publish(
            this.#EXCHANGE_NAME,
            routingKey,
            Buffer.from(JSON.stringify(event)),
            {
              persistent: true,
              headers: {
                'x-partition': partition,
                'x-retry-count': newRetryCount
              }
            }
          );

          console.log(
            `[Requeue] Message republished to ${routingKey} with retry count ${newRetryCount}`
          );
          resolve();
        } catch (error) {
          console.error('[Requeue Error] Failed to requeue message:', error.message);
          reject(error);
        }
      }, delay);
    });
  }

  async #publishEvent(eventType, payload) {
    const event = {
      eventType,
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      payload,
    };

    try {
      const RESULT_EXCHANGE = 'image.results'; // Fanout exchange

      // Ensure exchange exists
      await this.#channel.assertExchange(RESULT_EXCHANGE, 'fanout', { durable: true });

      // Publish to exchange (fanout duplicates to all bound queues)
      this.#channel.publish(RESULT_EXCHANGE, '', Buffer.from(JSON.stringify(event)), {
        persistent: true,
      });

      console.log(`[Event Published] ${eventType}`, { imageId: payload.imageId });
    } catch (error) {
      console.error(`[PublishEvent] Failed to publish ${eventType}:`, error.message);
    }
  }

  #determineErrorCode(error) {
    if (error.message.includes('PROCESSING_TIMEOUT')) return 'PROCESSING_TIMEOUT';
    if (error.message.includes('Gemini')) return 'GEMINI_API_ERROR';
    if (error.message.includes('Cloudinary')) return 'CLOUDINARY_ERROR';
    if (error.message.includes('download')) return 'IMAGE_DOWNLOAD_ERROR';
    if (error.message.includes('timeout')) return 'TIMEOUT_ERROR';
    if (error.message.includes('rate limit')) return 'RATE_LIMIT_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async stop() {
    // Consumer will stop automatically when connection closes
    console.log('Stopping consumer...');
  }
}

export default new ImageProcessingConsumer();

