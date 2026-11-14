// Chỉ tiêu doanh số THÁNG của 1 nhân viên bán hàng (do admin / quản lý đặt).
const mongoose = require('mongoose');

const salesTargetSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }, // nhân viên
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // "2026-11"
    amount: { type: Number, required: true, min: 0 }, // doanh thu mục tiêu (đồng)
    orders: { type: Number, default: 0, min: 0 }, // số đơn mục tiêu (0 = không đặt)
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // ai đặt
    setByName: { type: String, default: '' }
  },
  { timestamps: true }
);
salesTargetSchema.index({ staffId: 1, month: 1 }, { unique: true }); // mỗi người mỗi tháng 1 chỉ tiêu

module.exports = mongoose.model('SalesTarget', salesTargetSchema);
