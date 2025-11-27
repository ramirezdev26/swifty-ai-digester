import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * RabbitMQ Messages Consumed - Messages consumed from queues
 * Labels: event_type, status, partition
 */
export const rabbitmqMessagesConsumed = new Counter({
  name: 'swifty_ai_digester_rabbitmq_messages_consumed_total',
  help: 'Total number of messages consumed from RabbitMQ',
  labelNames: ['event_type', 'status', 'partition'],
});

/**
 * RabbitMQ Messages Published - Messages published to exchange
 * Labels: event_type, status
 */
export const rabbitmqMessagesPublished = new Counter({
  name: 'swifty_ai_digester_rabbitmq_messages_published_total',
  help: 'Total number of messages published to RabbitMQ',
  labelNames: ['event_type', 'status'],
});

/**
 * RabbitMQ Publish Duration - Duration of message publishing
 * Labels: event_type
 */
export const rabbitmqPublishDuration = new Histogram({
  name: 'swifty_ai_digester_rabbitmq_publish_duration_seconds',
  help: 'Duration of RabbitMQ message publishing in seconds',
  labelNames: ['event_type'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
});

/**
 * RabbitMQ Queue Depth - Number of messages in queue
 * Labels: queue_name
 */
export const rabbitmqQueueDepth = new Gauge({
  name: 'swifty_ai_digester_rabbitmq_queue_depth',
  help: 'Number of messages pending in RabbitMQ queue',
  labelNames: ['queue_name'],
});

/**
 * RabbitMQ Errors - RabbitMQ operation errors
 * Labels: error_type, operation (consume, publish, connect)
 */
export const rabbitmqErrorsTotal = new Counter({
  name: 'swifty_ai_digester_rabbitmq_errors_total',
  help: 'Total number of RabbitMQ errors',
  labelNames: ['error_type', 'operation'],
});

/**
 * RabbitMQ Message Retries - Message retry attempts
 * Labels: partition, retry_count
 */
export const rabbitmqMessageRetries = new Counter({
  name: 'swifty_ai_digester_rabbitmq_message_retries_total',
  help: 'Total number of message retry attempts',
  labelNames: ['partition', 'retry_count'],
});

/**
 * RabbitMQ Messages to DLQ - Messages sent to Dead Letter Queue
 * Labels: partition, reason
 */
export const rabbitmqMessagesToDLQ = new Counter({
  name: 'swifty_ai_digester_rabbitmq_messages_to_dlq_total',
  help: 'Total number of messages sent to Dead Letter Queue',
  labelNames: ['partition', 'reason'],
});

/**
 * RabbitMQ Consumer Lag - Time between message sent and consumed
 * Labels: partition
 */
export const rabbitmqConsumerLag = new Histogram({
  name: 'swifty_ai_digester_rabbitmq_consumer_lag_seconds',
  help: 'Time lag between message sent and consumed in seconds',
  labelNames: ['partition'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300], // Up to 5 minutes
});

/**
 * RabbitMQ Active Consumers - Number of active consumers per partition
 * Labels: partition
 */
export const rabbitmqActiveConsumers = new Gauge({
  name: 'swifty_ai_digester_rabbitmq_active_consumers',
  help: 'Number of active consumers per partition',
  labelNames: ['partition'],
});

