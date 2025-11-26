import axios from 'axios';
import geminiService from '../../infrastructure/services/gemini.service.js';
import cloudinaryService from '../../infrastructure/services/cloudinary.service.js';
import { withTimeout } from '../../infrastructure/utils/timeout-wrapper.js';
import config from '../../infrastructure/config/env.js';
import {
  createImageProcessingLogger,
  logProcessingStarted,
  logImageDownload,
  logGeminiProcessing,
  logGeminiRateLimit,
  logCloudinaryUpload,
  logProcessingCompleted,
  logProcessingFailed,
  logProcessingProgress
} from '../../infrastructure/logger/image-processing-logger.js';

class ProcessImageFromEventUseCase {
  constructor() {
    this.geminiService = geminiService;
    this.cloudinaryService = cloudinaryService;
    this.PROCESSING_TIMEOUT = config.processing.timeoutMs;
  }

  async execute(eventPayload) {
    const imageLogger = createImageProcessingLogger(eventPayload);
    const startTime = Date.now();
    const phases = {};

    try {
      logProcessingStarted(imageLogger, eventPayload);

      // Wrap entire processing pipeline with timeout to prevent worker blocking
      const result = await withTimeout(
        this.processImagePipeline(eventPayload, imageLogger, phases),
        this.PROCESSING_TIMEOUT,
        'PROCESSING_TIMEOUT'
      );

      const totalDuration = Date.now() - startTime;
      logProcessingCompleted(imageLogger, totalDuration, phases);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const phase = this.detectFailurePhase(phases);

      // Enhanced timeout error handling
      if (error.message === 'PROCESSING_TIMEOUT') {
        imageLogger.error({
          event: 'processing.timeout',
          duration,
          phase,
          timeoutMs: this.PROCESSING_TIMEOUT
        }, `Image processing timed out after ${this.PROCESSING_TIMEOUT}ms`);

        error.retryable = false; // Timeout should not retry automatically
      }

      logProcessingFailed(imageLogger, error, duration, phase);
      throw error;
    }
  }

  async processImagePipeline(eventPayload, imageLogger, phases) {
    const { imageId, originalImageUrl, style } = eventPayload;
    const startTime = Date.now();

    // Phase 1: Download original image
    logProcessingProgress(imageLogger, 'download', 10, 'Downloading original image...');
    const downloadStart = Date.now();
    const imageBuffer = await this.downloadImageFromUrl(originalImageUrl);
    phases.download = Date.now() - downloadStart;
    logImageDownload(imageLogger, 'download', phases.download, imageBuffer.length);

    // Phase 2: Process with Gemini AI (with retry logic)
    logProcessingProgress(imageLogger, 'gemini', 40, 'Processing with Gemini AI...');
    const geminiStart = Date.now();
    let retryCount = 0;
    let processedBuffer;
    const MAX_RETRIES = 5;

    while (retryCount <= MAX_RETRIES) {
      try {
        processedBuffer = await this.geminiService.processImage(imageBuffer, style);
        phases.gemini = Date.now() - geminiStart;
        logGeminiProcessing(imageLogger, 'gemini', phases.gemini, retryCount);
        break;
      } catch (error) {
        if (error.retryable && retryCount < MAX_RETRIES) {
          retryCount++;
          const retryAfter = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s, 16s, 32s
          logGeminiRateLimit(imageLogger, retryAfter, retryCount);
          await this.sleep(retryAfter);
        } else {
          throw error;
        }
      }
    }

    // Phase 3: Upload processed image to Cloudinary
    logProcessingProgress(imageLogger, 'cloudinary', 70, 'Uploading to Cloudinary...');
    const cloudinaryStart = Date.now();
    const uploadResult = await this.cloudinaryService.uploadImage(processedBuffer, {
      public_id: `processed_${imageId}_${Date.now()}`,
      folder: 'swifty-processed-images',
    });
    phases.cloudinary = Date.now() - cloudinaryStart;
    logCloudinaryUpload(imageLogger, phases.cloudinary, uploadResult);

    // Return success data
    return {
      imageId,
      processedUrl: uploadResult.secure_url,
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

  detectFailurePhase(phases) {
    if (!phases.download) return 'download';
    if (!phases.gemini) return 'gemini';
    if (!phases.cloudinary) return 'cloudinary';
    return 'unknown';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new ProcessImageFromEventUseCase();
