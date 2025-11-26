import rabbitmqService from '../services/rabbitmq.service.js';
import processImageUseCase from '../../application/use-cases/process-image-from-event.usecase.js';
import config from '../config/env.js';
import { logger } from '../logger/pino.config.js';
import { logEventPublished } from '../logger/image-processing-logger.js';

class ImageProcessingConsumer {
  #channel;
  #MAX_RETRIES = config.retry.maxRetries;
  #EXCHANGE_NAME = 'pixpro.processing';

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
    await this.#channel.consume(
      queueName,
      (message) => this.#handleReceivedMessage(message, queueName),
      { noAck: false }
    );

    logger.info({
      event: 'consumer.queue.listening',
      queueName
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
        userId: payload.userId,
        correlationId: eventId,
      });

      logEventPublished(messageLogger, 'ImageProcessed', 'image.processed');

      // Acknowledge message on success
      this.#channel.ack(message);

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
        retryable: isRetryable,
        retryCount,
        maxRetries: this.#MAX_RETRIES
      }, `Processing failed: ${error.message}`);

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

        logEventPublished(messageLogger, 'ProcessingFailed', 'image.failed');

        // NACK without requeue -> goes to DLQ via DLX
        this.#channel.nack(message, false, false);

        messageLogger.info({
          event: 'rabbitmq.message.nacked',
          requeue: false,
          destination: 'DLQ'
        }, 'Message NACK\'ed and sent to DLQ');
      }
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
    return config.retry.delays[retryCount] || config.retry.delays[config.retry.delays.length - 1];
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
