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
    // Nhóm quyền được gán (chỉ áp dụng cho role='staff' - admin luôn có toàn quyền, không cần gán
    // nhóm). 1 staff có thể thuộc nhiều nhóm cùng lúc, quyền thực tế = hợp của mọi nhóm đã gán.
    groupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PermissionGroup' }],
    // Chi nhánh được gán (VD: cho "Quản lý chi nhánh") - khi có giá trị, các quyền dạng "manage" của
    // staff này chỉ áp dụng được trong PHẠM VI cửa hàng này (hiện áp dụng cho inventory.manage - xem
    // storeInventoryController.js). null = không giới hạn theo chi nhánh, thao tác trên mọi cửa hàng
    // như quyền vốn có. Admin và staff không gán storeId không bị ảnh hưởng bởi field này.
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    // Các chi nhánh khác mà nhân viên này QUẢN LÝ THÊM (1 quản lý phụ trách nhiều chi nhánh). Phạm vi thao tác
    // = chi nhánh đang làm việc (storeId hoặc chi nhánh điều chuyển tạm thời) + các chi nhánh này; quản lý chọn
    // "chi nhánh đang làm việc" trên thanh trên cùng của trang quản trị (xem utils/staffScope.js).
    managedStoreIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
    title: { type: String, trim: true, default: '' }, // chức danh: "Nhân viên bán hàng", "Quản lý chi nhánh"...
    isActive: { type: Boolean, default: true },
    // Tăng lên khi đổi/đặt lại mật khẩu -> mọi token cấp trước đó (trên các thiết bị khác) hết hiệu lực
    tokenVersion: { type: Number, default: 0 },
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
