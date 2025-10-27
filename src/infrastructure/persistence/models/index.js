// Import all models here (this ensures they are registered with Sequelize)
import { UserModel } from './user.model.js';
import { ImageModel } from './image.model.js';
export { UserModel, ImageModel };

// Import sequelize instance
import sequelize from '../../config/database.js';
export { sequelize };

// Function to sync all models
export async function syncDatabase() {
  try {
    console.log('Syncing database models...');

    // Sync all models (this creates tables if they don't exist)
    await sequelize.sync({ force: false, alter: false });

    console.log('Database models synced successfully.');
    console.log('Available models:', Object.keys(sequelize.models));
  } catch (error) {
    console.error('Error syncing database models:', error);
    throw error;
  }
}
