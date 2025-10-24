import cloudinary from '../config/cloudinary.config.js';

class CloudinaryService {
  async uploadImage(buffer, options = {}) {
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
              reject(error);
            } else {
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
      console.error('Error uploading to Cloudinary:', error);
      throw new Error('Failed to upload image to cloud storage');
    }
  }
}

export default new CloudinaryService();
