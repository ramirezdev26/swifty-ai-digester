import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { UserModel } from './user.model.js';

export class ImageModel extends Model {}

ImageModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: UserModel,
        key: 'uid',
      },
    },
    cloudinary_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    style: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['oil-painting', 'pixel-art', 'cartoon', 'realism', 'anime']],
      },
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'processing',
      validate: {
        isIn: [['processing', 'processed', 'failed']],
      },
    },
    processed_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    processing_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Image',
    tableName: 'images',
    timestamps: true,
    freezeTableName: true,
    indexes: [
      {
        fields: ['user_id'],
      },
      {
        fields: ['status'],
      },
    ],
  }
);

ImageModel.belongsTo(UserModel, {
  foreignKey: 'user_id',
  targetKey: 'uid',
  as: 'user',
});

UserModel.hasMany(ImageModel, {
  foreignKey: 'user_id',
  sourceKey: 'uid',
  as: 'images',
});
