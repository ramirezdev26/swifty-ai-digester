import express from 'express';
import { register } from './prometheus.config.js';
import { logger } from '../logger/pino.config.js';

/**
 * Lightweight HTTP server dedicated to exposing metrics and health checks
 * This is NOT a full API server - only /metrics and /health endpoints
 */
export class MetricsServer {
  constructor(port = 9090) {
    this.port = port;
    this.app = express();
    this.server = null;
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'swifty-ai-digester',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        workerId: process.env.WORKER_ID || 'default',
      });
    });

    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.send(metrics);
      } catch (error) {
        logger.error({
          event: 'metrics.export.failed',
          error: { message: error.message, stack: error.stack },
        }, 'Failed to export metrics');
        res.status(500).send('Error generating metrics');
      }
    });

    // Catch-all for unsupported routes
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: 'This server only supports /metrics and /health endpoints',
      });
    });
  }

  start() {
    this.setupRoutes();
    
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info({
          event: 'metrics_server.started',
          port: this.port,
          endpoints: {
            metrics: `http://localhost:${this.port}/metrics`,
            health: `http://localhost:${this.port}/health`,
          },
        }, `Metrics server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info({ event: 'metrics_server.stopped' }, 'Metrics server stopped');
          resolve();
        });
      });
    }
  }
}

