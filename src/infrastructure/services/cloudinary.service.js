import cloudinary from '../config/cloudinary.config.js';
import { logger } from '../logger/pino.config.js';
import {
  logCloudinaryUploadStarted,
  logCloudinaryUploadFailed
} from '../logger/image-processing-logger.js';

class CloudinaryService {
  async uploadImage(buffer, options = {}) {
    const publicId = options.public_id || `processed-${Date.now()}`;
    const uploadLogger = logger.child({ publicId, service: 'cloudinary' });

    logCloudinaryUploadStarted(uploadLogger, buffer.length, publicId);
    const startTime = Date.now();

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
            if (error) {
              const duration = Date.now() - startTime;
              uploadLogger.error({
                event: 'cloudinary.upload.callback.error',
                duration,
                error: {
                  message: error.message,
                  code: error.http_code,
                  type: error.constructor?.name
                }
              }, 'Cloudinary upload callback error');
              reject(error);
            } else {
              const duration = Date.now() - startTime;
              uploadLogger.info({
                event: 'cloudinary.upload.completed',
                duration,
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                bytes: result.bytes,
                width: result.width,
                height: result.height
              }, `Image uploaded to Cloudinary in ${duration}ms`);

              resolve({
                public_id: result.public_id,
                secure_url: result.secure_url,
                url: result.url,
                bytes: result.bytes,
                format: result.format,
                width: result.width,
                height: result.height,
              });
            }
          }
        );

        uploadStream.end(buffer);
      });
    } catch (error) {
      logCloudinaryUploadFailed(uploadLogger, error, publicId);
      throw new Error(`CLOUDINARY_TIMEOUT: ${error.message}`);
    }
  }
}

export default new CloudinaryService();
