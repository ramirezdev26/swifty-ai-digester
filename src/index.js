import express from 'express';
import cors from 'cors';
import pino from 'pino';
import dotenv from 'dotenv';
import router from './presentation/routes/api.routes.js';
import errorMiddleware from './presentation/middleware/error.middleware.js';
import { initializeDatabase } from './infrastructure/persistence/initialize-database.js';

dotenv.config();

const isDevelopment = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  logger.debug('Headers:', req.headers);
  next();
});

app.use(express.json());
app.use('/api', router);

app.use(errorMiddleware);

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
  });
