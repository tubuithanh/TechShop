/**
 * Script một lần: tạo nhóm quyền mặc định "Quản lý vận hành" (đầy đủ quyền thao tác nghiệp vụ) và
 * gán cho MỌI tài khoản staff đã tồn tại trước khi tính năng phân quyền theo nhóm ra đời. Cần chạy
 * sau khi deploy code có tính năng này - nếu không, các tài khoản staff hiện có sẽ ĐỘT NGỘT mất hết
 * quyền truy cập trang quản trị (chưa được gán nhóm quyền nào = không có quyền gì).
 * Chạy: node seed/backfillStaffPermissions.js
 * Chạy trên Atlas (production): MONGO_URI="<atlas-connection-string>" node seed/backfillStaffPermissions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');

const DEFAULT_GROUP_NAME = 'Quản lý vận hành';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.name);

  let group = await PermissionGroup.findOne({ name: DEFAULT_GROUP_NAME });
  if (!group) {
    group = await PermissionGroup.create({
      name: DEFAULT_GROUP_NAME,
      description: 'Toàn bộ quyền thao tác nghiệp vụ hàng ngày (không gồm các thao tác chỉ-admin như xóa, cấu hình hệ thống)',
      permissions: PermissionGroup.PERMISSION_KEYS
    });
    console.log(`Đã tạo nhóm quyền mặc định "${DEFAULT_GROUP_NAME}".`);
  } else {
    console.log(`Nhóm quyền "${DEFAULT_GROUP_NAME}" đã tồn tại, dùng lại.`);
  }

  const result = await Admin.updateMany(
    { role: 'staff', $or: [{ groupIds: { $exists: false } }, { groupIds: { $size: 0 } }] },
    { $set: { groupIds: [group._id] } }
  );
  console.log(`Đã gán nhóm "${DEFAULT_GROUP_NAME}" cho ${result.modifiedCount} tài khoản staff chưa có nhóm quyền.`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillStaffPermissions:', err);
  process.exit(1);
});
