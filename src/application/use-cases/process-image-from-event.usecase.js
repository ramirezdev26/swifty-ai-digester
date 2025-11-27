import axios from 'axios';
import geminiService from '../../infrastructure/services/gemini.service.js';
import cloudinaryService from '../../infrastructure/services/cloudinary.service.js';
import { withTimeout } from '../../infrastructure/utils/timeout-wrapper.js';
import config from '../../infrastructure/config/env.js';
import {
  logProcessingStarted,
  logImageDownload,
  logGeminiProcessing,
  logGeminiRateLimit,
  logCloudinaryUpload,
  logProcessingCompleted,
  logProcessingFailed,
  logProcessingProgress
} from '../../infrastructure/logger/image-processing-logger.js';
import {
  imageProcessingDuration,
  imageProcessingPhaseDuration,
  imagesProcessedTotal,
  imagesBeingProcessed,
  processingErrorsByPhase,
  imageSizeBytes,
  processingTimeoutsTotal,
} from '../../infrastructure/metrics/image-processing.metrics.js';
import {
  geminiRetryAttempts,
  geminiBackoffDuration,
} from '../../infrastructure/metrics/gemini.metrics.js';
import { logger } from '../../infrastructure/logger/pino.config.js';

class ProcessImageFromEventUseCase {
  constructor() {
    this.geminiService = geminiService;
    this.cloudinaryService = cloudinaryService;
    this.PROCESSING_TIMEOUT = config.processing.timeoutMs || 60000; // 60 seconds
  }

  async execute(eventPayload) {
    const startTime = Date.now();
    const phases = {};
    const style = eventPayload.style || 'unknown';

    const imageLogger = logger.child({
      imageId: eventPayload.imageId,
      userId: eventPayload.userId,
      style: eventPayload.style
    });

    // Increment active processing gauge
    imagesBeingProcessed.inc();

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

      const totalDurationSeconds = totalDuration / 1000;

      // Record success metrics
      imageProcessingDuration.observe({ style, status: 'success' }, totalDurationSeconds);
      imagesProcessedTotal.inc({ style, status: 'success' });

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

        processingTimeoutsTotal.inc({ phase, style });
        error.retryable = false; // Timeout should not retry automatically
      }

      logProcessingFailed(imageLogger, error, duration, phase);

      const durationSeconds = duration / 1000;

      // Record failure metrics
      imageProcessingDuration.observe({ style, status: 'failed' }, durationSeconds);
      imagesProcessedTotal.inc({ style, status: 'failed' });
      processingErrorsByPhase.inc({
        phase,
        error_type: error.constructor?.name || 'Error',
        style,
      });

      throw error;

    } finally {
      // Decrement active processing gauge
      imagesBeingProcessed.dec();
    }
  }

  async processImagePipeline(eventPayload, imageLogger, phases) {
    const { imageId, originalImageUrl, style } = eventPayload;

    // Phase 1: Download original image
    logProcessingProgress(imageLogger, 'download', 10, 'Downloading original image...');
    const downloadStart = Date.now();
    const imageBuffer = await this.downloadImageFromUrl(originalImageUrl);
    phases.download = Date.now() - downloadStart;
    logImageDownload(imageLogger, 'download', phases.download, imageBuffer.length);

    // Record download phase metrics
    const downloadDurationSeconds = phases.download / 1000;
    imageProcessingPhaseDuration.observe({ phase: 'download', style }, downloadDurationSeconds);
    imageSizeBytes.observe({ style }, imageBuffer.length);

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
        break; // Success, exit retry loop
      } catch (error) {
        if (error.retryable && retryCount < MAX_RETRIES) {
          retryCount++;
          const retryAfter = Math.pow(2, retryCount) * 1000; // Exponential backoff

          logGeminiRateLimit(imageLogger, retryAfter, retryCount);

          // Record retry metrics
          geminiRetryAttempts.inc({ style, attempt_number: String(retryCount) });
          geminiBackoffDuration.observe({ style, attempt_number: String(retryCount) }, retryAfter / 1000);

          await this.sleep(retryAfter);
        } else {
          throw error;
        }
      }
    }

    // Record Gemini phase metrics
    const geminiDurationSeconds = phases.gemini / 1000;
    imageProcessingPhaseDuration.observe({ phase: 'gemini', style }, geminiDurationSeconds);

    // Phase 3: Upload processed image to Cloudinary
    logProcessingProgress(imageLogger, 'cloudinary', 70, 'Uploading to Cloudinary...');
    const cloudinaryStart = Date.now();
    const uploadResult = await this.cloudinaryService.uploadImage(processedBuffer, {
      public_id: `processed_${imageId}_${Date.now()}`,
      folder: 'swifty-processed-images',
    });
    phases.cloudinary = Date.now() - cloudinaryStart;
    logCloudinaryUpload(imageLogger, phases.cloudinary, uploadResult.secure_url, uploadResult.public_id);

    // Record Cloudinary phase metrics
    const cloudinaryDurationSeconds = phases.cloudinary / 1000;
    imageProcessingPhaseDuration.observe({ phase: 'cloudinary', style }, cloudinaryDurationSeconds);

    // Return success data
    return {
      imageId,
      processedUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      style,
      processingTime: phases.download + phases.gemini + phases.cloudinary
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

