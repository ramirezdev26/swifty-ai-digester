import { ImageModel } from '../models/image.model.js';
import { IImageRepository } from '../../../application/interfaces/iimage.repository.js';
import { ImageMapper } from '../../../application/mappers/image.mapper.js';
import { NotFoundError } from '../../../shared/errors/index.js';

export class ImageRepository extends IImageRepository {
  async create(image) {
    const created = await ImageModel.create({
      user_id: image.user_id,
      cloudinary_id: image.cloudinary_id,
      size: image.size,
      style: image.style,
      status: image.status,
      processed_url: image.processed_url,
      processing_time: image.processing_time,
      processed_at: image.processed_at,
    });

    return ImageMapper.toEntity(created);
  }

  async findById(id) {
    const image = await ImageModel.findByPk(id);
    return image ? ImageMapper.toEntity(image) : null;
  }

  async update(id, updateData) {
    const [updatedRowsCount] = await ImageModel.update(updateData, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      throw new NotFoundError('Image');
    }

    const updatedImage = await ImageModel.findByPk(id);
    return ImageMapper.toEntity(updatedImage);
  }

  async findByUserId(userId) {
    const images = await ImageModel.findAll({
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
    });

    return images.map((image) => ImageMapper.toEntity(image));
  }
}
