import { jest } from '@jest/globals';

const mockGeminiService = {
  processImage: jest.fn(),
};

const mockCloudinaryService = {
  uploadImage: jest.fn(),
};

jest.unstable_mockModule('../../../../src/infrastructure/services/gemini.service.js', () => ({
  default: mockGeminiService,
}));

jest.unstable_mockModule('../../../../src/infrastructure/services/cloudinary.service.js', () => ({
  default: mockCloudinaryService,
}));

const { ProcessImageUseCase } = await import(
  '../../../../src/application/use-cases/image/process-image.usecase.js'
);
const { NotFoundError } = await import('../../../../src/shared/errors/index.js');
const { Image } = await import('../../../../src/domain/entities/image.entity.js');
const { User } = await import('../../../../src/domain/entities/user.entity.js');

describe('ProcessImageUseCase', () => {
  let useCase;
  let mockImageRepository;
  let mockUserRepository;

  const mockUser = new User({
    uid: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    full_name: 'Test User',
    firebase_uid: 'firebase123',
  });

  const mockImageBuffer = Buffer.from('fake-image-data');
  const mockProcessedBuffer = Buffer.from('processed-image-data');
  const mockFirebaseUid = 'firebase123';
  const mockStyle = 'cartoon';
  const mockFileSize = 1024000;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGeminiService.processImage.mockReset();
    mockCloudinaryService.uploadImage.mockReset();

    mockImageRepository = {
      create: jest.fn(),
      update: jest.fn(),
    };

    mockUserRepository = {
      findByFirebaseUid: jest.fn(),
    };

    useCase = new ProcessImageUseCase(mockImageRepository, mockUserRepository);
  });

  describe('execute', () => {
    it('should process image successfully and return result', async () => {
      const mockSavedImage = new Image({
        id: 'image-id-123',
        user_id: mockUser.uid,
        size: mockFileSize,
        style: mockStyle,
        status: 'processing',
      });

      const mockUpdatedImage = new Image({
        id: 'image-id-123',
        user_id: mockUser.uid,
        size: mockFileSize,
        style: mockStyle,
        status: 'processed',
        cloudinary_id: 'cloudinary-id-123',
        processed_url: 'https://res.cloudinary.com/test/processed-image.jpg',
        processing_time: 1500,
        processed_at: new Date(),
      });

      const mockCloudinaryResult = {
        public_id: 'processed_image-id-123_123456789',
        secure_url: 'https://res.cloudinary.com/test/processed-image.jpg',
        url: 'http://res.cloudinary.com/test/processed-image.jpg',
        bytes: 500000,
        format: 'jpg',
        width: 1024,
        height: 768,
      };

      mockUserRepository.findByFirebaseUid.mockResolvedValue(mockUser);
      mockImageRepository.create.mockResolvedValue(mockSavedImage);
      mockGeminiService.processImage.mockResolvedValue(mockProcessedBuffer);
      mockCloudinaryService.uploadImage.mockResolvedValue(mockCloudinaryResult);
      mockImageRepository.update.mockResolvedValue(mockUpdatedImage);

      const result = await useCase.execute(
        mockFirebaseUid,
        mockImageBuffer,
        mockStyle,
        mockFileSize
      );

      expect(mockUserRepository.findByFirebaseUid).toHaveBeenCalledWith(mockFirebaseUid);
      expect(mockImageRepository.create).toHaveBeenCalledWith(expect.any(Image));
      expect(mockGeminiService.processImage).toHaveBeenCalledWith(mockImageBuffer, mockStyle);
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(
        mockProcessedBuffer,
        expect.objectContaining({
          public_id: expect.stringContaining('processed_image-id-123_'),
        })
      );
      expect(mockImageRepository.update).toHaveBeenCalledWith(
        mockSavedImage.id,
        expect.objectContaining({
          cloudinary_id: mockCloudinaryResult.public_id,
          processed_url: mockCloudinaryResult.secure_url,
          processing_time: expect.any(Number),
          status: 'processed',
          processed_at: expect.any(Date),
        })
      );

      expect(result).toEqual({
        imageId: mockUpdatedImage.id,
        processedUrl: mockUpdatedImage.processed_url,
        style: mockUpdatedImage.style,
        processedAt: mockUpdatedImage.processed_at,
      });
    });

    it('should throw NotFoundError when user is not found', async () => {
      mockUserRepository.findByFirebaseUid.mockResolvedValue(null);

      await expect(
        useCase.execute(mockFirebaseUid, mockImageBuffer, mockStyle, mockFileSize)
      ).rejects.toThrow(NotFoundError);

      expect(mockUserRepository.findByFirebaseUid).toHaveBeenCalledWith(mockFirebaseUid);
      expect(mockImageRepository.create).not.toHaveBeenCalled();
    });

    it('should update image status to failed when gemini processing fails', async () => {
      const mockSavedImage = new Image({
        id: 'image-id-123',
        user_id: mockUser.uid,
        size: mockFileSize,
        style: mockStyle,
        status: 'processing',
      });

      const processingError = new Error('Gemini processing failed');

      mockUserRepository.findByFirebaseUid.mockResolvedValue(mockUser);
      mockImageRepository.create.mockResolvedValue(mockSavedImage);
      mockGeminiService.processImage.mockRejectedValue(processingError);

      await expect(
        useCase.execute(mockFirebaseUid, mockImageBuffer, mockStyle, mockFileSize)
      ).rejects.toThrow(processingError);

      expect(mockImageRepository.update).toHaveBeenCalledWith(mockSavedImage.id, {
        status: 'failed',
      });
      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should update image status to failed when cloudinary upload fails', async () => {
      const mockSavedImage = new Image({
        id: 'image-id-123',
        user_id: mockUser.uid,
        size: mockFileSize,
        style: mockStyle,
        status: 'processing',
      });

      const uploadError = new Error('Cloudinary upload failed');

      mockUserRepository.findByFirebaseUid.mockResolvedValue(mockUser);
      mockImageRepository.create.mockResolvedValue(mockSavedImage);
      mockGeminiService.processImage.mockResolvedValue(mockProcessedBuffer);
      mockCloudinaryService.uploadImage.mockRejectedValue(uploadError);

      await expect(
        useCase.execute(mockFirebaseUid, mockImageBuffer, mockStyle, mockFileSize)
      ).rejects.toThrow(uploadError);

      expect(mockImageRepository.update).toHaveBeenCalledWith(mockSavedImage.id, {
        status: 'failed',
      });
    });

    it('should propagate repository errors during image creation', async () => {
      const repositoryError = new Error('Database connection failed');

      mockUserRepository.findByFirebaseUid.mockResolvedValue(mockUser);
      mockImageRepository.create.mockRejectedValue(repositoryError);

      await expect(
        useCase.execute(mockFirebaseUid, mockImageBuffer, mockStyle, mockFileSize)
      ).rejects.toThrow(repositoryError);

      expect(mockGeminiService.processImage).not.toHaveBeenCalled();
      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
    });

    it('should propagate user repository errors', async () => {
      const userRepositoryError = new Error('User database error');

      mockUserRepository.findByFirebaseUid.mockRejectedValue(userRepositoryError);

      await expect(
        useCase.execute(mockFirebaseUid, mockImageBuffer, mockStyle, mockFileSize)
      ).rejects.toThrow(userRepositoryError);

      expect(mockImageRepository.create).not.toHaveBeenCalled();
    });
  });
});
