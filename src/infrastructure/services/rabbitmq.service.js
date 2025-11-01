import amqp from 'amqplib';
import config from '../config/env.js';

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.maxRetries = 3;
    this.retryDelay = 5000;
  }

  async connect() {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        this.connection = await amqp.connect(config.rabbitmq.url);
        this.channel = await this.connection.createChannel();

        this.connection.on('error', (err) => {
          console.error('RabbitMQ connection error:', err.message);
        });

        this.connection.on('close', () => {
          console.error('RabbitMQ connection closed');
        });

        console.log('Connected to RabbitMQ');
        return;
      } catch (error) {
        retries++;
        console.error(
          `RabbitMQ connection attempt ${retries}/${this.maxRetries} failed:`,
          error.message
        );

        if (retries < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        } else {
          throw new Error(`Failed to connect to RabbitMQ after ${this.maxRetries} attempts`);
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
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error.message);
    }
  }
}

export default new RabbitMQService();
