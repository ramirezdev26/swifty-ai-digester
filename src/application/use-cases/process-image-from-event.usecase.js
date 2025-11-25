import axios from 'axios';
import geminiService from '../../infrastructure/services/gemini.service.js';
import cloudinaryService from '../../infrastructure/services/cloudinary.service.js';
import { withTimeout } from '../../infrastructure/utils/timeout-wrapper.js';
import config from '../../infrastructure/config/env.js';

class ProcessImageFromEventUseCase {
  constructor() {
    this.geminiService = geminiService;
    this.cloudinaryService = cloudinaryService;
    this.PROCESSING_TIMEOUT = config.processing.timeoutMs;
  }

  async execute(eventPayload) {
    const { imageId, originalImageUrl, style } = eventPayload;
    const startTime = Date.now();

    try {
      // Wrap entire processing pipeline with timeout to prevent worker blocking
      return await withTimeout(
        this.processImagePipeline(imageId, originalImageUrl, style, startTime),
        this.PROCESSING_TIMEOUT,
        'PROCESSING_TIMEOUT'
      );
    } catch (error) {
      // Enhanced timeout error handling
      if (error.message === 'PROCESSING_TIMEOUT') {
        console.error(`[Timeout] Image processing timed out after 60s for imageId: ${imageId}`);
        throw new Error('PROCESSING_TIMEOUT: Image processing exceeded 60 second limit');
      }
      throw error;
    }
  }

  async processImagePipeline(imageId, originalImageUrl, style, startTime) {
    // 1. Download image from Cloudinary URL
    console.log(`[Processing] Step 1/3 - Downloading image: ${imageId}`);
    const imageBuffer = await this.downloadImageFromUrl(originalImageUrl);
    console.log(`[Processing] Downloaded ${imageBuffer.length} bytes for image: ${imageId}`);

    // 2. Process with Gemini (use existing service)
    console.log(`[Processing] Step 2/3 - Processing with Gemini (style: ${style}): ${imageId}`);
    const processedBuffer = await this.geminiService.processImage(imageBuffer, style);
    console.log(`[Processing] Gemini processing complete for image: ${imageId}`);

    // 3. Upload to Cloudinary (use existing service)
    console.log(`[Processing] Step 3/3 - Uploading processed image: ${imageId}`);
    const result = await this.cloudinaryService.uploadImage(processedBuffer, {
      public_id: `processed_${imageId}_${Date.now()}`,
      folder: 'swifty-processed-images',
    });
    console.log(`[Processing] Uploaded to Cloudinary: ${result.secure_url}`);

    // 4. Return success data
    return {
      imageId,
      processedUrl: result.secure_url,
      processingTime: Date.now() - startTime,
      style,
    };
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
