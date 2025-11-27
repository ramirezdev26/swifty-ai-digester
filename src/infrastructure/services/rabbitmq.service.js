import amqp from 'amqplib';
import config from '../config/env.js';
import { setupRabbitMQInfrastructure } from './rabbitmq-setup.service.js';
import { logger } from '../logger/pino.config.js';
import {
  rabbitmqMessagesPublished,
  rabbitmqPublishDuration,
  rabbitmqErrorsTotal,
} from '../metrics/rabbitmq.metrics.js';

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.maxRetries = 3;
    this.retryDelay = 5000;
  }

  async connect() {
    let retries = 0;

    logger.info({
      event: 'rabbitmq.connection.attempting',
      url: config.rabbitmq.url.replace(/:[^:@]+@/, ':****@'), // Hide password
      maxRetries: this.maxRetries
    }, 'Attempting to connect to RabbitMQ...');

    while (retries < this.maxRetries) {
      try {
        this.connection = await amqp.connect(config.rabbitmq.url);
        this.channel = await this.connection.createChannel();

        logger.info({
          event: 'rabbitmq.channel.created'
        }, 'RabbitMQ channel created successfully');

        // Setup infrastructure with exact same config as API
        await setupRabbitMQInfrastructure(this.channel);

        this.connection.on('error', (err) => {
          logger.error({
            event: 'rabbitmq.connection.error',
            error: {
              message: err.message,
              code: err.code
            }
          }, `RabbitMQ connection error: ${err.message}`);
        });

        this.connection.on('close', () => {
          logger.warn({
            event: 'rabbitmq.connection.closed'
          }, 'RabbitMQ connection closed');
        });

        logger.info({
          event: 'rabbitmq.connection.success',
          exchange: config.rabbitmq.exchange,
          partitions: config.rabbitmq.partitions
        }, 'Connected to RabbitMQ successfully');

        return;
      } catch (error) {
        retries++;
        logger.error({
          event: 'rabbitmq.connection.failed',
          attempt: retries,
          maxRetries: this.maxRetries,
          error: {
            message: error.message,
            code: error.code
          }
        }, `RabbitMQ connection attempt ${retries}/${this.maxRetries} failed: ${error.message}`);

        if (retries < this.maxRetries) {
          logger.info({
            event: 'rabbitmq.connection.retry',
            delayMs: this.retryDelay,
            nextAttempt: retries + 1
          }, `Retrying in ${this.retryDelay}ms...`);

          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        } else {
          const finalError = new Error(`Failed to connect to RabbitMQ after ${this.maxRetries} attempts`);
          logger.fatal({
            event: 'rabbitmq.connection.fatal',
            attempts: retries,
            error: {
              message: finalError.message
            }
          }, finalError.message);
          throw finalError;
        }
      }
    }
  }

  async publishToQueue(queueName, message) {
    const startTime = Date.now();
    const eventType = message.eventType || 'unknown';

    try {
      await this.channel.assertQueue(queueName, { durable: true });
      this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });

      // Record success metrics
      const duration = (Date.now() - startTime) / 1000;
      rabbitmqPublishDuration.observe({ event_type: eventType }, duration);
      rabbitmqMessagesPublished.inc({ event_type: eventType, status: 'success' });

      logger.debug({
        event: 'rabbitmq.publish.success',
        queueName,
        eventType,
        duration: duration * 1000
      }, `Published message to queue ${queueName}`);
    } catch (error) {
      // Record error metrics
      rabbitmqMessagesPublished.inc({ event_type: eventType, status: 'error' });
      rabbitmqErrorsTotal.inc({ error_type: error.constructor?.name || 'PublishError', operation: 'publish' });

      logger.error({
        event: 'rabbitmq.publish.error',
        queueName,
        eventType,
        error: { message: error.message }
      }, `Error publishing to queue ${queueName}: ${error.message}`);

      throw error;
    }
  }

  async consumeFromQueue(queueName, handler) {
    try {
      await this.channel.assertQueue(queueName, { durable: true });
      await this.channel.consume(queueName, handler, { noAck: false });

      logger.info({
        event: 'rabbitmq.consume.started',
        queueName
      }, `Started consuming from queue: ${queueName}`);
    } catch (error) {
      logger.error({
        event: 'rabbitmq.consume.error',
        queueName,
        error: { message: error.message }
      }, `Error consuming from queue ${queueName}: ${error.message}`);

      throw error;
    }
  }

  getChannel() {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized. Call connect() first.');
    }
    return this.channel;
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
        logger.info({ event: 'rabbitmq.channel.closed' }, 'RabbitMQ channel closed successfully');
      }
      if (this.connection) {
        await this.connection.close();
        logger.info({ event: 'rabbitmq.connection.closed' }, 'RabbitMQ connection closed successfully');
      }
    } catch (error) {
      logger.error({
        event: 'rabbitmq.close.error',
        error: {
          message: error.message,
          code: error.code
        }
      }, `Error closing RabbitMQ connection: ${error.message}`);
    }
  }
}

export default new RabbitMQService();

