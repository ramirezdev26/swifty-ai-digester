export class IImageRepository {
  async create(image) {
    this._image = image;
    throw new Error('Method not implemented');
  }

  async findById(id) {
    this._id = id;
    throw new Error('Method not implemented');
  }

  async update(id, updateData) {
    this._id = id;
    this._updateData = updateData;
    throw new Error('Method not implemented');
  }

  async findByUserId(userId) {
    this._userId = userId;
    throw new Error('Method not implemented');
  }
}
