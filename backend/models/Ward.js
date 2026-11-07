const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

// Phường/xã/đặc khu thuộc một tỉnh/thành phố
const wardSchema = new mongoose.Schema(
  {
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: Number },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'wards' }
);

// Một tỉnh không có 2 phường/xã trùng tên
wardSchema.index({ provinceId: 1, name: 1 }, { unique: true });
wardSchema.plugin(searchablePlugin, { getParts: (doc) => [doc.name] });

module.exports = mongoose.model('Ward', wardSchema);
