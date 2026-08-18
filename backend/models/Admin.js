const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// LƯU Ý QUAN TRỌNG: theo thiết kế database mới, admins là COLLECTION RIÊNG BIỆT
// với users (không dùng chung 1 bảng phân biệt bằng trường "role" như thiết kế cũ).
// Điều này đồng nghĩa: khi xác thực (login), backend cần thử tìm trong cả 2 collection.
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    avatar: { type: String, default: '' },
    // role phụ để phân biệt Admin toàn quyền và Staff (nhân viên) - vẫn nằm trong collection admins
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'admins' }
);

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

adminSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

adminSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Admin', adminSchema);
