import { logger } from './pino.config.js';
import crypto from 'crypto';

/**
 * Creates a child logger for image processing with trace-id and full context
 * @param {Object} event - RabbitMQ event containing image processing data
 * @returns {Logger} Child logger with tracing context
 */
export const createImageProcessingLogger = (event) => {
  const traceId = event.traceId || event.metadata?.traceId || event.eventId || crypto.randomUUID();
  const imageId = event.imageId || event.payload?.imageId || event.data?.imageId;
  const userId = event.userId || event.payload?.userId || event.data?.userId;
  
  return logger.child({
    traceId,
    imageId,
    userId,
    processingId: crypto.randomUUID(), // Unique ID for this processing attempt
    source: 'rabbitmq'
  });
};

/**
 * Log processing start
 */
export const logProcessingStarted = (imageLogger, eventData) => {
  imageLogger.info({
    event: 'image.processing.started',
    style: eventData.style,
    originalUrl: eventData.originalImageUrl || eventData.originalUrl,
    timestamp: new Date().toISOString()
  }, `Started processing image with style: ${eventData.style}`);
};

/**
 * Log image download phase
 */
export const logImageDownload = (imageLogger, phase, duration, size) => {
  const sizeKB = (size / 1024).toFixed(2);
  const downloadSpeed = (size / (duration / 1000)).toFixed(0); // bytes/sec
  
  imageLogger.info({
    event: 'image.download.completed',
    phase,
    duration,
    size,
    sizeKB,
    downloadSpeed
  }, `Downloaded image in ${duration}ms (${sizeKB} KB)`);
};

/**
 * Log Gemini AI processing phase
 */
export const logGeminiProcessing = (imageLogger, phase, duration, retryCount = 0) => {
  imageLogger.info({
    event: 'gemini.processing.completed',
    phase,
    duration,
    retryCount,
    model: 'gemini-2.5-flash-image'
  }, `Gemini AI processed image in ${duration}ms (retry: ${retryCount})`);
};

/**
 * Log Gemini rate limiting
 */
export const logGeminiRateLimit = (imageLogger, retryAfter, retryCount) => {
  imageLogger.warn({
    event: 'gemini.rate_limit.hit',
    retryAfter,
    retryCount,
    willRetry: retryCount < 5
  }, `Gemini rate limit hit, will retry after ${retryAfter}ms (attempt ${retryCount})`);
};

/**
 * Log Cloudinary upload phase
 */
export const logCloudinaryUpload = (imageLogger, duration, uploadResult) => {
  const sizeKB = uploadResult.bytes ? (uploadResult.bytes / 1024).toFixed(2) : 'unknown';
  
  imageLogger.info({
    event: 'cloudinary.upload.completed',
    duration,
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    format: uploadResult.format,
    sizeKB,
    width: uploadResult.width,
    height: uploadResult.height
  }, `Uploaded processed image to Cloudinary in ${duration}ms`);
};

/**
 * Log RabbitMQ event publication
 */
export const logEventPublished = (imageLogger, eventType, routingKey) => {
  imageLogger.info({
    event: 'rabbitmq.event.published',
    eventType,
    routingKey,
    exchange: process.env.RABBITMQ_EXCHANGE || 'image.results'
  }, `Published ${eventType} event to RabbitMQ`);
};

/**
 * Log complete processing success
 */
export const logProcessingCompleted = (imageLogger, totalDuration, phases) => {
  imageLogger.info({
    event: 'image.processing.completed',
    totalDuration,
    phases: {
      download: phases.download || 0,
      gemini: phases.gemini || 0,
      cloudinary: phases.cloudinary || 0,
      publish: phases.publish || 0
    },
    success: true
  }, `Image processing completed in ${totalDuration}ms`);
};

/**
 * Log processing failure
 */
export const logProcessingFailed = (imageLogger, error, duration, phase) => {
  imageLogger.error({
    event: 'image.processing.failed',
    phase,
    duration,
    error: {
      type: error.constructor?.name || 'Error',
      message: error.message,
      stack: error.stack,
      code: error.code || error.statusCode
    },
    willRetry: error.retryable || false
  }, `Image processing failed at ${phase}: ${error.message}`);
};

/**
 * Log processing progress (for long operations)
 */
export const logProcessingProgress = (imageLogger, phase, progress, message) => {
  imageLogger.debug({
    event: 'image.processing.progress',
    phase,
    progress, // 0-100
    timestamp: new Date().toISOString()
  }, message);
};

/**
 * Log Gemini API request start
 */
export const logGeminiRequestStarted = (geminiLogger, style, imageSize) => {
  geminiLogger.debug({
    event: 'gemini.request.started',
    style,
    imageSize,
    imageSizeKB: (imageSize / 1024).toFixed(2),
    model: 'gemini-2.5-flash-image'
  }, `Sending image to Gemini AI for ${style} processing`);
};

/**
 * Log Gemini API request failure
 */
export const logGeminiRequestFailed = (geminiLogger, error, style) => {
  geminiLogger.error({
    event: 'gemini.request.failed',
    error: {
      type: error.constructor?.name || 'Error',
      message: error.message,
      code: error.code,
      statusCode: error.statusCode
    },
    style,
    retryable: error.retryable || false
  }, 'Gemini AI request failed');
};

/**
 * Log Cloudinary upload start
 */
export const logCloudinaryUploadStarted = (uploadLogger, size, publicId) => {
  uploadLogger.debug({
    event: 'cloudinary.upload.started',
    size,
    sizeKB: (size / 1024).toFixed(2),
    publicId
  }, 'Uploading image to Cloudinary');
};

/**
 * Log Cloudinary upload failure
 */
export const logCloudinaryUploadFailed = (uploadLogger, error, publicId) => {
  uploadLogger.error({
    event: 'cloudinary.upload.failed',
    error: {
      type: error.constructor?.name || 'Error',
      message: error.message,
      code: error.code || error.http_code
    },
    publicId
  }, 'Cloudinary upload failed');
};

export default {
  createImageProcessingLogger,
  logProcessingStarted,
  logImageDownload,
  logGeminiProcessing,
  logGeminiRateLimit,
  logCloudinaryUpload,
  logEventPublished,
  logProcessingCompleted,
  logProcessingFailed,
  logProcessingProgress,
  logGeminiRequestStarted,
  logGeminiRequestFailed,
  logCloudinaryUploadStarted,
  logCloudinaryUploadFailed
};

