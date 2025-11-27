import { Histogram, Counter, Gauge } from 'prom-client';

/**
 * Image Processing Duration - Total duration of image processing
 * Labels: style, status (success, failed)
 */
export const imageProcessingDuration = new Histogram({
  name: 'swifty_ai_digester_image_processing_duration_seconds',
  help: 'Total duration of image processing in seconds',
  labelNames: ['style', 'status'],
  buckets: [1, 2.5, 5, 10, 15, 20, 30, 45, 60, 90, 120], // 1s to 2 minutes
});

/**
 * Image Processing Phase Duration - Duration per phase
 * Labels: phase (download, gemini, cloudinary, publish), style
 */
export const imageProcessingPhaseDuration = new Histogram({
  name: 'swifty_ai_digester_processing_phase_duration_seconds',
  help: 'Duration of each processing phase in seconds',
  labelNames: ['phase', 'style'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 15, 20, 30, 45, 60], // Phases can vary significantly
});

/**
 * Images Processed Total - Counter of processed images
 * Labels: style, status
 */
export const imagesProcessedTotal = new Counter({
  name: 'swifty_ai_digester_images_processed_total',
  help: 'Total number of images processed',
  labelNames: ['style', 'status'],
});

/**
 * Images Being Processed - Gauge of currently processing images
 */
export const imagesBeingProcessed = new Gauge({
  name: 'swifty_ai_digester_images_being_processed',
  help: 'Number of images currently being processed',
});

/**
 * Processing Errors by Phase - Errors per phase
 * Labels: phase, error_type, style
 */
export const processingErrorsByPhase = new Counter({
  name: 'swifty_ai_digester_processing_errors_by_phase_total',
  help: 'Total number of processing errors by phase',
  labelNames: ['phase', 'error_type', 'style'],
});

/**
 * Image Size Bytes - Size of processed images
 * Labels: style
 */
export const imageSizeBytes = new Histogram({
  name: 'swifty_ai_digester_image_size_bytes',
  help: 'Size of images processed in bytes',
  labelNames: ['style'],
  buckets: [100000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000], // 100KB to 25MB
});

/**
 * Processing Timeouts Total - Counter of timeout errors
 * Labels: phase, style
 */
export const processingTimeoutsTotal = new Counter({
  name: 'swifty_ai_digester_processing_timeouts_total',
  help: 'Total number of processing timeouts',
  labelNames: ['phase', 'style'],
});

