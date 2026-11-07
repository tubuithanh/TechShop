const mongoose = require('mongoose');

// Tỉnh/thành phố (theo đơn vị hành chính mới từ 01/07/2025: 34 tỉnh/thành, bỏ cấp quận/huyện).
// Quản lý ở Admin -> Tỉnh thành & phường xã; ẩn (isActive=false) thì khách không chọn được nữa.
const provinceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: Number },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'provinces' }
);

provinceSchema.index({ sortOrder: 1, name: 1 });

module.exports = mongoose.model('Province', provinceSchema);
