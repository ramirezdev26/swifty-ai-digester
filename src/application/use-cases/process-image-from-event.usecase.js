import axios from 'axios';
import geminiService from '../../infrastructure/services/gemini.service.js';
import cloudinaryService from '../../infrastructure/services/cloudinary.service.js';

class ProcessImageFromEventUseCase {
  constructor() {
    this.geminiService = geminiService;
    this.cloudinaryService = cloudinaryService;
  }

  async execute(eventPayload) {
    const { imageId, originalImageUrl, style } = eventPayload;
    const startTime = Date.now();

    try {
      // 1. Download image from Cloudinary URL
      const imageBuffer = await this.downloadImageFromUrl(originalImageUrl);

      // 2. Process with Gemini (use existing service)
      const processedBuffer = await this.geminiService.processImage(imageBuffer, style);

      // 3. Upload to Cloudinary (use existing service)
      const result = await this.cloudinaryService.uploadImage(processedBuffer, {
        public_id: `processed_${imageId}_${Date.now()}`,
        folder: 'swifty-processed-images',
      });

      // 4. Return success data
      return {
        imageId,
        processedUrl: result.secure_url,
        processingTime: Date.now() - startTime,
        style,
      };
    } catch (error) {
      throw error;
    }
  }

  async downloadImageFromUrl(url) {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }
}

export default new ProcessImageFromEventUseCase();
