import dotenv from 'dotenv';
import imageProcessingConsumer from './infrastructure/consumers/image-processing.consumer.js';
import rabbitmqService from './infrastructure/services/rabbitmq.service.js';

dotenv.config();

async function startWorker() {
  console.log('AI Digester starting...');

  try {
    // Connect to RabbitMQ
    await rabbitmqService.connect();

    // Start consumer
    await imageProcessingConsumer.start();

    console.log('AI Digester ready. Waiting for messages...');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await imageProcessingConsumer.stop();
  await rabbitmqService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await imageProcessingConsumer.stop();
  await rabbitmqService.close();
  process.exit(0);
});

// Start the worker
startWorker();
