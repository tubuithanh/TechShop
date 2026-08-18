const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Lưu OTP tạm thời phục vụ xác thực đăng ký/đổi mật khẩu
const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['register', 'reset_password'], required: true },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Tự động xóa document khi hết hạn (TTL index)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

otpSchema.statics.generateCode = function () {
  return String(Math.floor(100000 + Math.random() * 900000)); // mã 6 số
};

otpSchema.methods.compareCode = function (candidateCode) {
  return bcrypt.compare(candidateCode, this.codeHash);
};

module.exports = mongoose.model('Otp', otpSchema);
