import rabbitmqService from '../services/rabbitmq.service.js';
import processImageUseCase from '../../application/use-cases/process-image-from-event.usecase.js';
import config from '../config/env.js';

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

    console.log('Starting consumer for partitioned queues...');

    for (const partition of partitions) {
      const queueName = `image.processing.partition.${partition}`;


      // One message per worker for better load distribution
      await this.#channel.prefetch(config.processing.prefetchCount);

      console.log(`[Partition ${partition}] Queue configured: ${queueName}`);

      // Start consuming from this partition queue
      await this.#consumeFromQueue(queueName);
    }

    console.log('Consumer started for all partitions');
  }

  async #consumeFromQueue(queueName) {
    await this.#channel.consume(
      queueName,
      (message) => this.#handleReceivedMessage(message, queueName),
      { noAck: false }
    );

    console.log(`[Consumer] Listening on queue: ${queueName}`);
  }

  async #handleReceivedMessage(message, queueName) {
    if (!message) return;

    const retryCount = message.properties.headers?.['x-retry-count'] || 0;
    const partition = message.properties.headers?.['x-partition'];
    let event;

    try {
      event = JSON.parse(message.content.toString());
      const { eventId, payload } = event;

      console.log(
        `[${queueName}] Processing imageId: ${payload.imageId} (retry: ${retryCount}/${this.#MAX_RETRIES})`
      );

      // Execute use case
      const result = await this.processImageUseCase.execute(payload);

      // Publish success event
      await this.#publishEvent('ImageProcessed', {
        ...result,
        correlationId: eventId,
      });

      // Acknowledge message on success
      this.#channel.ack(message);
      console.log(`[${queueName}] ✓ Completed: ${payload.imageId}`);
    } catch (error) {
      // Handle error with retry logic
      const parsedEvent = event || JSON.parse(message.content.toString());

      if (this.#isRetryableError(error) && retryCount < this.#MAX_RETRIES) {
        // Retry with backoff
        const delay = this.#calculateBackoff(retryCount);
        console.log(`[Retry ${retryCount + 1}/${this.#MAX_RETRIES}] Requeuing after ${delay}ms`);

        await this.#requeueWithDelay(parsedEvent, partition, retryCount + 1, delay);
        this.#channel.ack(message); // ACK original

      } else {
        // Max retries exceeded or non-retryable error -> DLQ
        console.error(`[DLQ] Message failed after ${retryCount} retries:`, error.message);

        // Publish error event
        await this.#publishEvent('image.failed', {
          imageId: parsedEvent.payload?.imageId,
          error: error.message,
          errorCode: this.#determineErrorCode(error),
          retryCount: retryCount,
          timestamp: new Date().toISOString()
        });

        // NACK without requeue -> goes to DLQ via DLX
        this.#channel.nack(message, false, false);
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
    try {
      await this.rabbitmqService.publishToQueue('status_updates', {
        eventType,
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        version: '1.0',
        payload,
      });

      console.log(`[Event Published] ${eventType}`, { imageId: payload.imageId });
    } catch (error) {
      console.error(`[Event Publish Error] Failed to publish ${eventType}:`, error.message);
      // Don't throw - event publishing failure shouldn't affect message processing
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
