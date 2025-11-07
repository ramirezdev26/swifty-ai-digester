/**
 * RabbitMQ Infrastructure Setup Service
 * Sets up partitioned queues with Dead Letter Exchange support
 * MUST match swifty-api configuration exactly
 */
import config from '../config/env.js';

export async function setupRabbitMQInfrastructure(channel) {
  try {
    const {
      exchange,
      dlxExchange,
      partitions,
      messageTtl,
      dlqTtl
    } = config.rabbitmq;

    // Create topic exchange for processing
    await channel.assertExchange(exchange, 'topic', { durable: true });

    // Create Dead Letter Exchange
    await channel.assertExchange(dlxExchange, 'topic', { durable: true });

    // Create partitioned queues for load balancing
    for (let i = 0; i < partitions; i++) {
      const queueName = `image.processing.partition.${i}`;

      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': dlxExchange,
          'x-dead-letter-routing-key': 'dlq.processing',
          'x-max-priority': 10,
          'x-message-ttl': messageTtl,
        },
      });

      // Bind each partition queue to the exchange
      await channel.bindQueue(queueName, exchange, `image.uploaded.partition.${i}`);
    }

    // Create Dead Letter Queue
    await channel.assertQueue('dlq.processing', {
      durable: true,
      arguments: {
        'x-message-ttl': dlqTtl,
        'x-max-length': 10000,
      },
    });

    // Bind DLQ to Dead Letter Exchange
    await channel.bindQueue('dlq.processing', dlxExchange, 'dlq.#');

    console.log('RabbitMQ infrastructure setup completed (Consumer)');
  } catch (error) {
    console.error('Error setting up RabbitMQ infrastructure:', error);
    throw error;
  }
}
