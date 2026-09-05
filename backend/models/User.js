const mongoose = require('mongoose');
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
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // password không có trong schema gốc nhưng bắt buộc phải có để đăng nhập bằng email/mật khẩu
    // (đồ án dùng xác thực nội bộ thay vì Firebase Auth như tên field "photoURL/displayName" gợi ý)
    password: { type: String, required: true, minlength: 6, select: false },
    avatar: { type: String, default: '' },
    gender: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    // ID tài khoản Zalo khi đăng nhập qua Zalo OAuth - sparse để không xung đột với các user đăng ký bằng email thường
    zaloId: { type: String, unique: true, sparse: true },
    addresses: [addressSchema],
    favoriteProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    savedPostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: Date
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'users' }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.role = 'customer'; // hằng số, giúp code phía client dùng chung logic phân quyền với Admin
  return obj;
};

module.exports = mongoose.model('User', userSchema);
