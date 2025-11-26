import dotenv from 'dotenv';
import imageProcessingConsumer from './infrastructure/consumers/image-processing.consumer.js';
import rabbitmqService from './infrastructure/services/rabbitmq.service.js';
import { logger } from './infrastructure/logger/pino.config.js';

dotenv.config();

async function startWorker() {
  logger.info({
    event: 'worker.startup.initiated',
    nodeVersion: process.version,
    pid: process.pid,
    workerId: logger.bindings().workerId,
    environment: process.env.NODE_ENV || 'development'
  }, '🚀 AI Digester starting...');

  try {
    // Connect to RabbitMQ
    logger.info({
      event: 'worker.rabbitmq.connecting'
    }, 'Connecting to RabbitMQ...');

    await rabbitmqService.connect();

    logger.info({
      event: 'worker.rabbitmq.connected'
    }, '✅ RabbitMQ connected');

    // Start consumer
    logger.info({
      event: 'worker.consumer.starting'
    }, 'Starting image processing consumer...');

    await imageProcessingConsumer.start();

    logger.info({
      event: 'worker.consumer.ready'
    }, '✅ Consumer ready');

    logger.info({
      event: 'worker.startup.completed',
      status: 'ready'
    }, '🎉 AI Digester ready. Waiting for messages...');
  } catch (error) {
    logger.fatal({
      event: 'worker.startup.failed',
      error: {
        type: error.constructor?.name || 'Error',
        message: error.message,
        stack: error.stack
      }
    }, `❌ Failed to start worker: ${error.message}`);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info({
    event: 'worker.shutdown.initiated',
    signal: 'SIGTERM'
  }, 'Received SIGTERM, shutting down gracefully...');

  try {
    // Wait for current processing to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (imageProcessingConsumer.stop) {
      await imageProcessingConsumer.stop();
    }
    await rabbitmqService.close();

    logger.info({
      event: 'worker.shutdown.completed'
    }, 'Worker shut down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error({
      event: 'worker.shutdown.error',
      error: {
        message: error.message
      }
    }, 'Error during shutdown');
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info({
    event: 'worker.shutdown.initiated',
    signal: 'SIGINT'
  }, 'Received SIGINT, shutting down gracefully...');

  try {
    if (imageProcessingConsumer.stop) {
      await imageProcessingConsumer.stop();
    }
    await rabbitmqService.close();

    logger.info({
      event: 'worker.shutdown.completed'
    }, 'Worker shut down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error({
      event: 'worker.shutdown.error',
      error: {
        message: error.message
      }
    }, 'Error during shutdown');
    process.exit(1);
  }
});

// Uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({
    event: 'worker.uncaught_exception',
    error: {
      type: error.constructor?.name || 'Error',
      message: error.message,
      stack: error.stack
    }
  }, `Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    event: 'worker.unhandled_rejection',
    reason: String(reason),
    promise: String(promise)
  }, `Unhandled promise rejection: ${reason}`);
});

// Start the worker
startWorker();
