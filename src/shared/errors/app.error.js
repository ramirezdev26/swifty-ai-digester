import { ErrorCode } from '../constants/error-codes.js';

/**
 * Base class for custom application errors
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - Descriptive error message
   * @param {number} statusCode - HTTP status code
   * @param {ErrorCode} [errorCode] - Internal error code (optional)
   */
  constructor(message, statusCode, errorCode = ErrorCode.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serializes the error for HTTP responses
   * @returns {Object}
   */
  toJSON() {
    return {
      status: 'error',
      errorCode: this.errorCode,
      message: this.message,
    };
  }
}
