import { Histogram, Counter, Gauge } from 'prom-client';

/**
 * Cloudinary Upload Duration - Duration of uploads
 * Labels: status
 */
export const cloudinaryUploadDuration = new Histogram({
  name: 'swifty_ai_digester_cloudinary_upload_duration_seconds',
  help: 'Duration of Cloudinary uploads in seconds',
  labelNames: ['status'],
  buckets: [0.5, 1, 2.5, 5, 10, 15, 20, 30], // Uploads can vary
});

/**
 * Cloudinary Uploads Total - Counter of uploads
 * Labels: status (success, error)
 */
export const cloudinaryUploadsTotal = new Counter({
  name: 'swifty_ai_digester_cloudinary_uploads_total',
  help: 'Total number of Cloudinary uploads',
  labelNames: ['status'],
});

/**
 * Cloudinary Active Uploads - Gauge of active uploads
 */
export const cloudinaryActiveUploads = new Gauge({
  name: 'swifty_ai_digester_cloudinary_active_uploads',
  help: 'Number of active Cloudinary uploads',
});

/**
 * Cloudinary Upload Size - Size of uploaded files
 */
export const cloudinaryUploadSize = new Histogram({
  name: 'swifty_ai_digester_cloudinary_upload_size_bytes',
  help: 'Size of files uploaded to Cloudinary in bytes',
  buckets: [100000, 500000, 1000000, 2500000, 5000000, 10000000],
});

/**
 * Cloudinary Errors by Type - Errors by type
 * Labels: error_type
 */
export const cloudinaryErrorsByType = new Counter({
  name: 'swifty_ai_digester_cloudinary_errors_by_type_total',
  help: 'Total number of Cloudinary errors by type',
  labelNames: ['error_type'],
});

/**
 * Cloudinary Upload Speed - Upload throughput
 * Labels: speed_tier (slow, medium, fast)
 */
export const cloudinaryUploadSpeed = new Histogram({
  name: 'swifty_ai_digester_cloudinary_upload_speed_bytes_per_second',
  help: 'Upload speed to Cloudinary in bytes per second',
  buckets: [100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000], // 100KB/s to 10MB/s
});

