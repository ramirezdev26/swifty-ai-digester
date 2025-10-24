import { AppError } from '../../shared/errors/app.error.js';
import { ErrorCode } from '../../shared/constants/error-codes.js';
import pino from 'pino';

const logger = pino();

// eslint-disable-next-line no-unused-vars
export const errorMiddleware = (err, req, res, next) => {
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      ...err,
    },
    req: {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers,
    },
  });

  const error = err instanceof Error ? err : new Error(err);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json(error.toJSON());
  }

  if (error.isJoi) {
    const validationError = {
      status: 'error',
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      errors: error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message,
      })),
    };
    return res.status(400).json(validationError);
  }

  if (error.code?.startsWith('auth/')) {
    return res.status(401).json({
      status: 'error',
      errorCode: ErrorCode.AUTH_ERROR,
      message: error.message,
      code: error.code,
    });
  }

  logger.error(error);
  return res.status(500).json({
    status: 'error',
    errorCode: ErrorCode.INTERNAL_ERROR,
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
  });
};

export default errorMiddleware;
