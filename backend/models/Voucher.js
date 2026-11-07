const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

const voucherSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    description: String,
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    maxDiscountAmount: Number, // áp dụng khi discountType = percent
    minOrderValue: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 0 }, // 0 = không giới hạn (tổng toàn hệ thống)
    usedCount: { type: Number, default: 0 },
    perCustomerLimit: { type: Number, default: 1 }, // 0 = không giới hạn số lần dùng của mỗi khách
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

voucherSchema.methods.isValidNow = function () {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.startDate &&
    now <= this.endDate &&
    (this.usageLimit === 0 || this.usedCount < this.usageLimit)
  );
};

// Tìm kiếm không dấu: mã và mô tả chương trình
voucherSchema.plugin(searchablePlugin, { getParts: (doc) => [doc.code, doc.description] });

module.exports = mongoose.model('Voucher', voucherSchema);
