const mongoose = require('mongoose');

// Slide (banner lớn) ở đầu trang chủ - quản lý ở Admin -> Slide trang chủ.
const slideSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, default: '', trim: true, maxlength: 80 }, // nhãn nhỏ phía trên tiêu đề
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, default: '', trim: true, maxlength: 300 },
    buttonText: { type: String, default: '', trim: true, maxlength: 40 },
    buttonLink: { type: String, default: '', trim: true, maxlength: 300 },
    // Nền: theme = theo màu chính của giao diện | gradient = dải 2 màu tự chọn | image = ảnh
    bgType: { type: String, enum: ['theme', 'gradient', 'image'], default: 'theme' },
    colorFrom: { type: String, default: '#dc2626', match: /^#[0-9a-f]{6}$/i },
    colorTo: { type: String, default: '#f97316', match: /^#[0-9a-f]{6}$/i },
    imageUrl: { type: String, default: '', trim: true },
    // Ảnh nền: phủ lớp tối để chữ trắng dễ đọc
    darkOverlay: { type: Boolean, default: true },
    textColor: { type: String, enum: ['light', 'dark'], default: 'light' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Chỉ hiển thị trong khoảng thời gian này (để trống = luôn hiển thị) - VD slide khuyến mãi Tết
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'slides' }
);

slideSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Slide', slideSchema);
