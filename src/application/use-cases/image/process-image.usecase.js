import { Image } from '../../../domain/entities/image.entity.js';
import { NotFoundError } from '../../../shared/errors/index.js';
import geminiService from '../../../infrastructure/services/gemini.service.js';
import cloudinaryService from '../../../infrastructure/services/cloudinary.service.js';

export class ProcessImageUseCase {
  constructor(imageRepository, userRepository) {
    this.imageRepository = imageRepository;
    this.userRepository = userRepository;
  }

  async execute(firebase_uid, imageBuffer, style, fileSize) {
    const startTime = Date.now();

    try {
      const user = await this.userRepository.findByFirebaseUid(firebase_uid);
      if (!user) {
        throw new NotFoundError('User');
      }

      const imageEntity = new Image({
        user_id: user.uid,
        size: fileSize,
        style: style,
        status: 'processing',
      });

      const savedImage = await this.imageRepository.create(imageEntity);

      try {
        const processedImageBuffer = await geminiService.processImage(imageBuffer, style);

        const cloudinaryResult = await cloudinaryService.uploadImage(processedImageBuffer, {
          public_id: `processed_${savedImage.id}_${Date.now()}`,
        });

        const processingTime = Date.now() - startTime;

        const updatedImage = await this.imageRepository.update(savedImage.id, {
          cloudinary_id: cloudinaryResult.public_id,
          processed_url: cloudinaryResult.secure_url,
          processing_time: processingTime,
          status: 'processed',
          processed_at: new Date(),
        });

        return {
          imageId: updatedImage.id,
          processedUrl: updatedImage.processed_url,
          style: updatedImage.style,
          processedAt: updatedImage.processed_at,
        };
      } catch (processingError) {
        await this.imageRepository.update(savedImage.id, {
          status: 'failed',
        });
        throw processingError;
      }
    } catch (error) {
      console.error('Error in ProcessImageUseCase:', error);
      throw error;
    }
  }
}
