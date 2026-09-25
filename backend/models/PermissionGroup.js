const mongoose = require('mongoose');

// Danh mục quyền cố định của hệ thống - mỗi quyền tương ứng với 1 nhóm chức năng quản trị mà nhân
// viên (staff) có thể được cấp. Admin luôn có TOÀN QUYỀN (không cần gán nhóm quyền) - danh sách này
// chỉ áp dụng để phân quyền chi tiết cho staff. Các thao tác nhạy cảm hơn (xóa dữ liệu, cấu hình hệ
// thống, quản lý nhóm quyền/nhân viên, tạo/sửa/xóa voucher, danh mục, thương hiệu, cửa hàng) vẫn CHỈ
// dành cho admin, không nằm trong danh sách này - staff dù được gán quyền gì cũng không đụng tới được.
const PERMISSIONS = [
  { key: 'products.manage', label: 'Quản lý sản phẩm (thêm/sửa)' },
  { key: 'collections.manage', label: 'Quản lý bộ sưu tập (thêm/sửa)' },
  { key: 'inventory.manage', label: 'Quản lý tồn kho' },
  { key: 'orders.manage', label: 'Quản lý đơn hàng' },
  { key: 'vouchers.view', label: 'Xem danh sách khuyến mãi' },
  { key: 'reviews.manage', label: 'Quản lý đánh giá' },
  { key: 'warranties.manage', label: 'Quản lý bảo hành' },
  { key: 'articles.manage', label: 'Quản lý tin tức (thêm/sửa)' },
  { key: 'customers.view', label: 'Xem danh sách khách hàng' },
  { key: 'chat.support', label: 'Chat hỗ trợ khách hàng' },
  { key: 'dashboard.view', label: 'Xem thống kê tổng quan' }
];
const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

const permissionGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    permissions: [{ type: String, enum: PERMISSION_KEYS }]
  },
  { timestamps: true, collection: 'permission_groups' }
);

const PermissionGroup = mongoose.model('PermissionGroup', permissionGroupSchema);
PermissionGroup.PERMISSIONS = PERMISSIONS;
PermissionGroup.PERMISSION_KEYS = PERMISSION_KEYS;

module.exports = PermissionGroup;
