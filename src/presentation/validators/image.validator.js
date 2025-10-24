import Joi from 'joi';
import { ValidationError } from '../../shared/errors/index.js';

const processImageSchema = Joi.object({
  style: Joi.string()
    .valid('oil-painting', 'pixel-art', 'cartoon', 'realism', 'anime')
    .required()
    .messages({
      'string.empty': 'Style is required',
      'any.only': 'Style must be one of: oil-painting, pixel-art, cartoon, realism, anime',
      'any.required': 'Style is required',
    }),
}).options({ stripUnknown: true });

export const validateProcessImageInput = (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      throw new ValidationError('Only JPEG and PNG images are allowed');
    }

    const maxSize = 10 * 1024 * 1024;
    if (req.file.size > maxSize) {
      throw new ValidationError('Image size must be less than 10MB');
    }

    const { error } = processImageSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((err) => ({
        field: err.path[0],
        message: err.message,
      }));
      throw new ValidationError('Validation failed', errors);
    }

    next();
  } catch (error) {
    next(error);
  }
};
