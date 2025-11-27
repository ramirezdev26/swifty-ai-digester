import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/env.js';
import { logger } from '../logger/pino.config.js';
import {
  logGeminiRequestStarted,
  logGeminiRequestFailed
} from '../logger/image-processing-logger.js';
import crypto from 'crypto';
import {
  geminiRequestDuration,
  geminiRequestsTotal,
  geminiRateLimitHits,
  geminiTokensUsed,
  geminiActiveRequests,
  geminiErrorsByType,
} from '../metrics/gemini.metrics.js';

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.modelName = 'gemini-2.5-flash-image';
    this.temperature = 0.4;

    const generationConfig = {
      temperature: this.temperature,
      responseModalities: ['TEXT', 'IMAGE'],
    };

    this.model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig,
    });
  }

  static stripDataUrlPrefix(b64) {
    return (b64 || '').replace(/^data:[^;]+;base64,/, '');
  }

  static extractTextAndImage(response) {
    let text = '';
    let imageBase64 = null;
    let imageMimeType = null;

    const parts = response?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.inlineData?.data && !imageBase64) {
        imageBase64 = part.inlineData.data;
        imageMimeType = part.inlineData.mimeType || null;
      }
    }
    return { text: text.trim(), imageBase64, imageMimeType };
  }

  detectImageFormat(buffer) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    } else if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'image/gif';
    } else if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46
    ) {
      return 'image/webp';
    }

    return 'image/jpeg';
  }

  async processImage(imageBuffer, style) {
    const requestId = crypto.randomUUID();
    const geminiLogger = logger.child({ requestId, service: 'gemini-ai' });
    const startTime = Date.now();

    // Increment active requests gauge
    geminiActiveRequests.inc();

    try {
      if (!this.model) {
        const error = new Error('Gemini model not initialized.');
        geminiLogger.error({
          event: 'gemini.initialization.failed',
          error: { message: error.message }
        }, 'Gemini model not initialized');
        throw error;
      }

      const mimeType = this.detectImageFormat(imageBuffer);
      const base64Data = imageBuffer.toString('base64');

      logGeminiRequestStarted(geminiLogger, style, imageBuffer.length);

      const prompt = `Transform this image into a ${style}. Return the edited image.`;

      const result = await this.model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: GeminiService.stripDataUrlPrefix(base64Data),
                },
              },
            ],
          },
        ],
      });

      const resp = await result.response;
      const duration = Date.now() - startTime;
      const durationSeconds = duration / 1000;
      const { imageBase64 } = GeminiService.extractTextAndImage(resp);

      if (imageBase64) {
        // Record success metrics
        geminiRequestDuration.observe({ style, status: 'success' }, durationSeconds);
        geminiRequestsTotal.inc({ style, status: 'success' });

        // Record token usage if available
        if (resp.usageMetadata?.totalTokenCount) {
          geminiTokensUsed.observe({ style }, resp.usageMetadata.totalTokenCount);
        }

        geminiLogger.info({
          event: 'gemini.request.completed',
          duration,
          style,
          model: this.modelName,
          hasImage: true,
          tokensUsed: resp.usageMetadata?.totalTokenCount
        }, `Gemini AI processing completed in ${duration}ms`);

        return Buffer.from(imageBase64, 'base64');
      } else {
        // Record as success but with warning
        geminiRequestDuration.observe({ style, status: 'success' }, durationSeconds);
        geminiRequestsTotal.inc({ style, status: 'success' });

        geminiLogger.warn({
          event: 'gemini.no_image_returned',
          duration,
          style,
          model: this.modelName
        }, 'No processed image returned from Gemini, using original');

        return imageBuffer;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const durationSeconds = duration / 1000;
      const errorType = error.constructor?.name || 'Error';

      // Detect rate limit errors
      const isRateLimit =
        error.message?.includes('RATE_LIMIT') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('429') ||
        error.code === 'RATE_LIMIT_EXCEEDED' ||
        error.code === 'RESOURCE_EXHAUSTED';

      if (isRateLimit) {
        // Mark retryable and record rate limit metrics
        error.retryable = true;
        error.code = 'RATE_LIMIT_EXCEEDED';

        geminiRateLimitHits.inc({ style });
        geminiRequestsTotal.inc({ style, status: 'rate_limited' });
        geminiRequestDuration.observe({ style, status: 'rate_limited' }, durationSeconds);

        geminiLogger.warn({
          event: 'gemini.rate_limit.hit',
          style,
          duration
        }, 'Gemini API rate limit hit');
      } else {
        // Record general error metrics
        geminiRequestsTotal.inc({ style, status: 'error' });
        geminiRequestDuration.observe({ style, status: 'error' }, durationSeconds);
        geminiErrorsByType.inc({ error_type: errorType, style });
      }

      logGeminiRequestFailed(geminiLogger, error, style);

      throw new Error(`GEMINI_TIMEOUT: ${error.message}`);
    } finally {
      // Decrement active requests gauge
      geminiActiveRequests.dec();
    }
  }

  async testConnection() {
    try {
      this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });
      logger.info({
        event: 'gemini.connection.test.success',
        model: this.modelName
      }, 'Gemini AI connection test successful');
      return true;
    } catch (error) {
      logger.error({
        event: 'gemini.connection.test.failed',
        model: this.modelName,
        error: {
          message: error.message,
          type: error.constructor?.name
        }
      }, 'Gemini AI connection test failed');
      return false;
    }
  }
}

export default new GeminiService();
