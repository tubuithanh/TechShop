const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    slug: { type: String, required: true, unique: true }
  },
  { collection: 'categories' }
);

module.exports = mongoose.model('Category', categorySchema);
