import pino from 'pino';
import crypto from 'crypto';

/**
 * Pino Logger Configuration for AI Worker
 * Handles structured logging for long-running image processing operations
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'swifty-ai-digester',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    workerId: process.env.WORKER_ID || crypto.randomUUID()
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      '*.apiKey',
      '*.GEMINI_API_KEY',
      '*.CLOUDINARY_API_SECRET',
      '*.CLOUDINARY_API_KEY',
      'gemini.apiKey',
      'cloudinary.apiSecret',
      'cloudinary.apiKey'
    ],
    remove: true
  },
  transport: process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY !== 'false' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '{service} [{workerId}] - {msg}',
      singleLine: false
    }
  } : undefined
});

export default logger;

