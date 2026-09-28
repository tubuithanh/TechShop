const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    orderNote: { type: String, default: '' },
    // Nhãn phân loại địa chỉ: cho phép chọn nhanh "Nhà riêng"/"Công ty" hoặc tự nhập nhãn bất kỳ
    label: { type: String, default: 'Nhà riêng' },
    isDefault: { type: Boolean, default: false }
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    displayName: { type: String, default: '' },
    // Email KHÔNG bắt buộc: tài khoản đăng nhập bằng Zalo để trống (Zalo không cung cấp email), khách tự thêm
    // email sau ở trang Thông tin tài khoản (xác thực bằng mã gửi tới email). Chuỗi rỗng -> bỏ hẳn trường
    // (undefined) để chỉ số "không trùng" bên dưới không coi nhiều tài khoản trống email là trùng nhau.
    email: { type: String, lowercase: true, trim: true, set: (v) => (typeof v === 'string' && v.trim() ? v : undefined) },
    // password không có trong schema gốc nhưng bắt buộc phải có để đăng nhập bằng email/mật khẩu
    // (đồ án dùng xác thực nội bộ thay vì Firebase Auth như tên field "photoURL/displayName" gợi ý)
    password: { type: String, required: true, minlength: 6, select: false },
    avatar: { type: String, default: '' },
    gender: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    // ID tài khoản Zalo khi đăng nhập qua Zalo OAuth (trường riêng, không lưu vào email) - sparse để không xung đột
    // với các user đăng ký bằng email thường
    zaloId: { type: String, unique: true, sparse: true },
    addresses: [addressSchema],
    favoriteProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    savedPostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    isActive: { type: Boolean, default: true },
    // Tăng lên khi đổi/đặt lại mật khẩu -> mọi token cấp trước đó (trên các thiết bị khác) hết hiệu lực
    tokenVersion: { type: Number, default: 0 },
    isEmailVerified: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: Date
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'users' }
);

// Email không trùng - chỉ áp dụng cho tài khoản CÓ email (tài khoản Zalo chưa thêm email thì bỏ qua)
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'email_unique_if_set' });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Trước đây tài khoản Zalo được gán email tạm dạng zalo<id>@zalo.techshop.local (khi email còn bắt buộc).
// Khi máy chủ khởi động, email tạm này được xóa đi (utils/migrateUserEmails.js); hàm dưới dùng để nhận biết và
// chặn nhập lại dạng email này.
const PLACEHOLDER_EMAIL_DOMAIN = 'zalo.techshop.local';
const isPlaceholderEmail = (email) => String(email || '').toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.role = 'customer'; // hằng số, giúp code phía client dùng chung logic phân quyền với Admin
  obj.hasEmail = Boolean(obj.email);
  return obj;
};

// Tìm kiếm không dấu: họ tên, email, số điện thoại (xem utils/search.js)
userSchema.plugin(searchablePlugin, { getParts: (doc) => [doc.displayName, doc.email, doc.phoneNumber] });

module.exports = mongoose.model('User', userSchema);
module.exports.isPlaceholderEmail = isPlaceholderEmail;
module.exports.PLACEHOLDER_EMAIL_DOMAIN = PLACEHOLDER_EMAIL_DOMAIN;
