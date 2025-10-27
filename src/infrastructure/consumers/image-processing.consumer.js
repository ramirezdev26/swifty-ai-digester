import rabbitmqService from '../services/rabbitmq.service.js';
import processImageUseCase from '../../application/use-cases/process-image-from-event.usecase.js';

class ImageProcessingConsumer {
  constructor() {
    this.rabbitmqService = rabbitmqService;
    this.processImageUseCase = processImageUseCase;
    this.queueName = 'image_processing';
  }

  async start() {
    await this.rabbitmqService.consumeFromQueue(this.queueName, this.handleMessage.bind(this));
  }

  async handleMessage(message) {
    const channel = this.rabbitmqService.getChannel();
    let event;

    try {
      event = JSON.parse(message.content.toString());
      const { eventId, payload } = event;

      console.log(`Processing: ${payload.imageId}`);

      // Execute use case
      const result = await this.processImageUseCase.execute(payload);

      // Publish success event
      await this.rabbitmqService.publishToQueue('status_updates', {
        eventType: 'ImageProcessed',
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        version: '1.0',
        correlationId: eventId,
        payload: result,
      });

      // Acknowledge message
      channel.ack(message);
      console.log(`Completed: ${payload.imageId}`);
    } catch (error) {
      try {
        // Publish error event
        await this.rabbitmqService.publishToQueue('status_updates', {
          eventType: 'ProcessingError',
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          version: '1.0',
          correlationId: event?.eventId || 'unknown',
          payload: {
            imageId: event?.payload?.imageId || 'unknown',
            error: {
              code: this.determineErrorCode(error),
              message: error.message,
              retryable: this.isRetryableError(error),
            },
          },
        });
      } catch (publishError) {
        console.error('Failed to publish error event:', publishError.message);
      }

      // Acknowledge message (don't requeue)
      channel.ack(message);
      console.error(`Failed: ${event?.payload?.imageId || 'unknown'} - ${error.message}`);
    }
  }

  determineErrorCode(error) {
    if (error.message.includes('Gemini')) return 'GEMINI_API_ERROR';
    if (error.message.includes('Cloudinary')) return 'CLOUDINARY_ERROR';
    if (error.message.includes('download')) return 'IMAGE_DOWNLOAD_ERROR';
    return 'UNKNOWN_ERROR';
  }

  isRetryableError(error) {
    return (
      error.message.includes('rate limit') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    );
  }

  async stop() {
    // Consumer will stop automatically when connection closes
    console.log('Stopping consumer...');
  }
}

export default new ImageProcessingConsumer();
