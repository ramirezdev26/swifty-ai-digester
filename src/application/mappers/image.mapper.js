import { Image } from '../../domain/entities/image.entity.js';

export class ImageMapper {
  static toEntity(data) {
    return new Image({
      id: data.id,
      user_id: data.user_id,
      cloudinary_id: data.cloudinary_id,
      size: data.size,
      style: data.style,
      status: data.status,
      processed_url: data.processed_url,
      processing_time: data.processing_time,
      processed_at: data.processed_at,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    });
  }

  static toResponseDTO(image) {
    return {
      imageId: image.id,
      userId: image.user_id,
      cloudinaryId: image.cloudinary_id,
      size: image.size,
      style: image.style,
      status: image.status,
      processedUrl: image.processed_url,
      processingTime: image.processing_time,
      processedAt: image.processed_at,
      createdAt: image.created_at,
      updatedAt: image.updated_at,
    };
  }
}
