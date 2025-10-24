import { AppError } from './app.error.js';
import { ErrorCode } from '../constants/error-codes.js';

/**
 * Error for conflicts (duplicate resources)
 * @extends AppError
 */
export class ConflictError extends AppError {
  /**
   * @param {string} [resource='Resource'] - Name of the conflicting resource
   * @param {string} [identifier=''] - Resource identifier
   */
  constructor(resource = 'Resource', identifier = '') {
    const message = identifier
      ? `${resource} with identifier ${identifier} already exists`
      : `${resource} already exists`;
    super(message, 409, ErrorCode.CONFLICT);
  }
}
