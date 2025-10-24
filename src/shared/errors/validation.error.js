import { AppError } from './app.error.js';
import { ErrorCode } from '../constants/error-codes.js';

/**
 * Error for failed validations
 * @extends AppError
 */
export class ValidationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object[]} [errors] - List of validation errors
   */
  constructor(message, errors = []) {
    super(message, 400, ErrorCode.VALIDATION_ERROR);
    this.errors = errors;
  }

  /**
   * @override
   */
  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}
