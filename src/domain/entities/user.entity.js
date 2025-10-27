import { ValidationError } from '../../shared/errors/index.js';

export class User {
  constructor({
    uid = null,
    firebase_uid,
    email,
    full_name = null,
    created_at = null,
    updated_at = null,
  }) {
    this._uid = uid;
    this._firebase_uid = firebase_uid;
    this._email = this.validateEmail(email);
    this._full_name = full_name;
    this._created_at = created_at;
    this._updated_at = updated_at;
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }
    return email;
  }

  get uid() {
    return this._uid;
  }

  get firebase_uid() {
    return this._firebase_uid;
  }

  get email() {
    return this._email;
  }

  get full_name() {
    return this._full_name;
  }

  get created_at() {
    return this._created_at;
  }

  get updated_at() {
    return this._updated_at;
  }
}
