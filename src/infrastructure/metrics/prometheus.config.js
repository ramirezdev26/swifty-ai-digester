import { register, collectDefaultMetrics } from 'prom-client';
import crypto from 'crypto';

// Configure default system metrics collection
collectDefaultMetrics({
  prefix: 'swifty_ai_digester_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10,
  labels: {
    service: 'swifty-ai-digester',
    worker_id: process.env.WORKER_ID || crypto.randomUUID().substring(0, 8),
  },
});

// Export the registry
export { register };

