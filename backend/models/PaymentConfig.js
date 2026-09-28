const mongoose = require('mongoose');

// Cấu hình cổng thanh toán VNPay và MoMo do admin nhập trong "Cấu hình hệ thống" (2 tab riêng).
// Lưu RIÊNG khỏi collection settings (GET /api/settings là API công khai). Secret Key chỉ lưu dạng đã mã hóa
// (utils/secretBox.js) và không bao giờ trả về trình duyệt. Cùng 1 bản ghi cho cả 2 cổng.
const paymentConfigSchema = new mongoose.Schema(
  {
    // env: dùng biến môi trường VNP_* | custom: dùng thông tin nhập ở trang quản trị | off: tắt thanh toán VNPay
    vnpayMode: { type: String, enum: ['env', 'custom', 'off'], default: 'env' },
    vnpTmnCode: { type: String, default: '', trim: true },
    vnpHashSecretEnc: { type: String, default: '' },
    vnpUrl: { type: String, default: '', trim: true },
    vnpReturnUrl: { type: String, default: '', trim: true },

    // MoMo: env = biến môi trường MOMO_* | custom = nhập ở trang quản trị | off = tắt
    momoMode: { type: String, enum: ['env', 'custom', 'off'], default: 'env' },
    momoPartnerCode: { type: String, default: '', trim: true },
    momoAccessKey: { type: String, default: '', trim: true },
    momoSecretKeyEnc: { type: String, default: '' },
    momoEndpoint: { type: String, default: '', trim: true },
    momoRedirectUrl: { type: String, default: '', trim: true },
    momoIpnUrl: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'payment_configs' }
);

module.exports = mongoose.model('PaymentConfig', paymentConfigSchema);
