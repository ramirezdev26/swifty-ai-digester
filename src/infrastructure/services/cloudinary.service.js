import cloudinary from '../config/cloudinary.config.js';
import { logger } from '../logger/pino.config.js';
import {
  cloudinaryUploadDuration,
  cloudinaryUploadsTotal,
  cloudinaryUploadSize,
  cloudinaryErrorsByType,
  cloudinaryUploadSpeed,
} from '../metrics/cloudinary.metrics.js';

class CloudinaryService {
  async uploadImage(buffer, options = {}) {
    const startTime = Date.now();
    const uploadLogger = logger.child({ service: 'cloudinary' });

    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'swifty-processed-images',
            format: 'jpg',
            ...options,
          },
          (error, result) => {
            const duration = Date.now() - startTime;

            if (error) {
              const durationSeconds = duration / 1000;

              uploadLogger.error({
                event: 'cloudinary.upload.callback.error',
                duration,
                error: {
                  message: error.message,
                  code: error.http_code,
                  type: error.constructor?.name
                }
              }, 'Cloudinary upload callback error');

              cloudinaryUploadDuration.observe({ status: 'error' }, durationSeconds);
              cloudinaryUploadsTotal.inc({ status: 'error' });
              cloudinaryErrorsByType.inc({ error_type: error.constructor?.name || 'CloudinaryError' });

              reject(error);
            } else {
              const durationSeconds = duration / 1000;

              cloudinaryUploadDuration.observe({ status: 'success' }, durationSeconds);
              cloudinaryUploadsTotal.inc({ status: 'success' });
              cloudinaryUploadSize.observe(buffer.length);

              const uploadSpeedBytesPerSecond = buffer.length / durationSeconds;
              cloudinaryUploadSpeed.observe(uploadSpeedBytesPerSecond);

              uploadLogger.info({
                event: 'cloudinary.upload.completed',
                duration,
                publicId: result.public_id,
                url: result.secure_url,
                bytes: result.bytes,
                width: result.width,
                height: result.height
              }, `Image uploaded to Cloudinary in ${duration}ms`);

              resolve({
                public_id: result.public_id,
                secure_url: result.secure_url,
                url: result.url,
                bytes: result.bytes,
                width: result.width,
                height: result.height
              });
            }
          }
        );

        uploadStream.end(buffer);
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const durationSeconds = duration / 1000;

      uploadLogger.error({
        event: 'cloudinary.upload.failed',
        error: {
          type: error.constructor.name,
          message: error.message,
          code: error.http_code
        }
      }, 'Cloudinary upload failed');

      cloudinaryUploadDuration.observe({ status: 'error' }, durationSeconds);
      cloudinaryUploadsTotal.inc({ status: 'error' });
      cloudinaryErrorsByType.inc({ error_type: error.constructor.name });

      throw error;
    }
  }
}

export default new CloudinaryService();

