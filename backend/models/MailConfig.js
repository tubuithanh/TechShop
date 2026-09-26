const mongoose = require('mongoose');

// Cấu hình gửi email do admin nhập trong "Cấu hình hệ thống > Email". Lưu RIÊNG khỏi collection settings vì
// GET /api/settings là API công khai (header/footer đọc) - không được để lộ mật khẩu ra đó.
// Mật khẩu SMTP và API key chỉ lưu dạng đã mã hóa (utils/secretBox.js), không bao giờ trả về trình duyệt.
const mailConfigSchema = new mongoose.Schema(
  {
    // env: dùng biến môi trường (SMTP_*/RESEND_API_KEY) | smtp | resend | gmail: Gmail API (OAuth2, cổng 443)
    // | off: tắt, chế độ demo
    provider: { type: String, enum: ['env', 'smtp', 'resend', 'gmail', 'off'], default: 'env' },
    smtpHost: { type: String, default: '', trim: true },
    smtpPort: { type: Number, default: 587, min: 1, max: 65535 },
    smtpUser: { type: String, default: '', trim: true },
    smtpPasswordEnc: { type: String, default: '' },
    resendApiKeyEnc: { type: String, default: '' },
    // Gmail API: OAuth client tạo trong Google Cloud Console + refresh token nhận được khi admin bấm
    // "Kết nối tài khoản Gmail" (bí mật đều mã hóa); gmailEmail = địa chỉ Gmail đã cấp quyền gửi
    gmailClientId: { type: String, default: '', trim: true },
    gmailClientSecretEnc: { type: String, default: '' },
    gmailRefreshTokenEnc: { type: String, default: '' },
    gmailEmail: { type: String, default: '' },
    from: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'mail_configs' }
);

module.exports = mongoose.model('MailConfig', mailConfigSchema);
