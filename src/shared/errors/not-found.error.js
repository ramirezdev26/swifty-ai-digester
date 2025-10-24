import { AppError } from './app.error.js';
import { ErrorCode } from '../constants/error-codes.js';

/**
 * Error for resources not found
 * @extends AppError
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} [resource='Resource'] - Name of the resource not found
   * @param {string} [identifier=''] - Resource identifier
   */
  constructor(resource = 'Resource', identifier = '') {
    const message = identifier
      ? `${resource} with identifier ${identifier} not found`
      : `${resource} not found`;
    super(message, 404, ErrorCode.NOT_FOUND);
  }
}
