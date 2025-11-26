import sequelize from '../config/database.js';
import { syncDatabase } from './models/index.js';

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    return true;
  } catch (error) {
    console.log(
      process.env.DB_HOST,
      process.env.DB_PORT,
      process.env.DB_USERNAME,
      process.env.DB_PASSWORD,
      process.env.DB_NAME
    );
    console.error('Unable to connect to the database:', error.message);
    return false;
  }
}

async function retryConnection(maxRetries = 10, initialDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Database connection attempt ${attempt}/${maxRetries}...`);

    const success = await testConnection();
    if (success) {
      return true;
    }

    if (attempt < maxRetries) {
      const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
}

export async function initializeDatabase(maxRetries = null) {
  // Use environment variables if available, otherwise use defaults
  const retries = maxRetries || parseInt(process.env.DB_CONNECTION_RETRIES) || 10;
  const timeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000;

  try {
    console.log('Initializing database connection...');
    console.log(`Max retries: ${retries}, Connection timeout: ${timeout}ms`);
    await retryConnection(retries, 1000);

    console.log('Syncing database tables...');
    await syncDatabase();

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Database initialization failed after all retries:', error.message);
    throw error;
  }
}
