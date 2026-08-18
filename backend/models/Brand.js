const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, default: '' }
  },
  { collection: 'brands' }
);

module.exports = mongoose.model('Brand', brandSchema);
