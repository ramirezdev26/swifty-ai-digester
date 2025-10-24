import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.modelName = 'gemini-2.0-flash-preview-image-generation';
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
    Date.now();
    try {
      if (!this.model) throw new Error('Model not initialized.');

      const mimeType = this.detectImageFormat(imageBuffer);
      const base64Data = imageBuffer.toString('base64');

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
      const { imageBase64 } = GeminiService.extractTextAndImage(resp);

      if (imageBase64) {
        return Buffer.from(imageBase64, 'base64');
      } else {
        console.warn('No processed image returned from Gemini, using original');
        return imageBuffer;
      }
    } catch (error) {
      console.error('Error processing image with Gemini:', error);
      return imageBuffer;
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
      return true;
    } catch (_) {
      return false;
    }
  }
}

export default new GeminiService();
