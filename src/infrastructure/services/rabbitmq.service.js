import amqp from 'amqplib';
import config from '../config/env.js';
import { setupRabbitMQInfrastructure } from './rabbitmq-setup.service.js';
import { logger } from '../logger/pino.config.js';

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
    try {
      await this.channel.assertQueue(queueName, { durable: true });
      this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });
    } catch (error) {
      console.error(`Error publishing to queue ${queueName}:`, error.message);
      throw error;
    }
  }

  async consumeFromQueue(queueName, handler) {
    try {
      await this.channel.assertQueue(queueName, { durable: true });
      await this.channel.prefetch(1);

      await this.channel.consume(queueName, handler, { noAck: false });
    } catch (error) {
      console.error(`Error consuming from queue ${queueName}:`, error.message);
      throw error;
    }
  }

  getChannel() {
    return this.channel;
  }

  async close() {
    try {
      logger.info({
        event: 'rabbitmq.closing'
      }, 'Closing RabbitMQ connection...');

      if (this.channel) {
        await this.channel.close();
        logger.debug({ event: 'rabbitmq.channel.closed' }, 'RabbitMQ channel closed');
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
