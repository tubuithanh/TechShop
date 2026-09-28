const mongoose = require('mongoose');

// Cấu hình cổng thanh toán VNPay do admin nhập trong "Cấu hình hệ thống > Cấu hình thanh toán VNPay".
// Lưu RIÊNG khỏi collection settings (GET /api/settings là API công khai). Secret Key chỉ lưu dạng đã mã hóa
// (utils/secretBox.js) và không bao giờ trả về trình duyệt.
const paymentConfigSchema = new mongoose.Schema(
  {
    // env: dùng biến môi trường VNP_* | custom: dùng thông tin nhập ở trang quản trị | off: tắt thanh toán VNPay
    vnpayMode: { type: String, enum: ['env', 'custom', 'off'], default: 'env' },
    vnpTmnCode: { type: String, default: '', trim: true },
    vnpHashSecretEnc: { type: String, default: '' },
    vnpUrl: { type: String, default: '', trim: true },
    vnpReturnUrl: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'payment_configs' }
);

module.exports = mongoose.model('PaymentConfig', paymentConfigSchema);
