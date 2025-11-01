import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    frontendUrl: process.env.FRONTEND_URL,
    apiPrefix: process.env.API_PREFIX,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL,
    dlxExchange: process.env.RABBITMQ_DLX_EXCHANGE,
    messageTtl: parseInt(process.env.RABBITMQ_MESSAGE_TTL) || 300000,
  },
  // Retry configuration for failed message processing
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
    delays: [
      parseInt(process.env.RETRY_DELAY_1, 10) || 5000,  // First retry: 5 seconds
      parseInt(process.env.RETRY_DELAY_2, 10) || 15000, // Second retry: 15 seconds
      parseInt(process.env.RETRY_DELAY_3, 10) || 30000, // Third retry: 30 seconds
    ],
  },
  // Processing configuration for image operations
  processing: {
    timeoutMs: parseInt(process.env.PROCESSING_TIMEOUT_MS, 10) || 60000, // 60 seconds timeout
    prefetchCount: parseInt(process.env.PREFETCH_COUNT, 10) || 1,        // Messages per worker
  },
};

export default config;
