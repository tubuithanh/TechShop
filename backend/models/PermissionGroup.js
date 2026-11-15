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
  { key: 'orders.pos', label: 'Bán hàng tại quầy' },
  { key: 'vouchers.view', label: 'Xem danh sách khuyến mãi' },
  { key: 'reviews.manage', label: 'Quản lý đánh giá' },
  { key: 'warranties.manage', label: 'Quản lý bảo hành' },
  { key: 'articles.manage', label: 'Quản lý tin tức (thêm/sửa)' },
  { key: 'customers.view', label: 'Xem danh sách khách hàng' },
  { key: 'chat.support', label: 'Chat hỗ trợ khách hàng' },
  { key: 'dashboard.view', label: 'Xem thống kê tổng quan' },
  { key: 'deliveries.manage', label: 'Phân công giao hàng, đối soát tiền COD' },
  { key: 'deliveries.perform', label: 'Giao hàng (nhân viên giao hàng)' },
  // ----- Kế toán: làm việc với TIỀN và CHỨNG TỪ, chỉ XEM đơn (không đổi trạng thái / phân công giao hàng)
  { key: 'orders.view', label: 'Xem đơn hàng (chỉ xem)' },
  { key: 'finance.payments', label: 'Kế toán: xác nhận chuyển khoản, hoàn tiền' },
  { key: 'finance.cod', label: 'Kế toán: đối soát tiền COD (shipper, đơn vị vận chuyển)' },
  { key: 'einvoices.manage', label: 'Kế toán: hóa đơn điện tử (phát hành, hủy, thay thế)' },
  { key: 'finance.reports', label: 'Kế toán: báo cáo doanh thu, thống kê' },
  { key: 'einvoices.config', label: 'Kế toán trưởng: cấu hình hóa đơn điện tử (người bán, ký hiệu, nhà cung cấp)' }
];
const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

const permissionGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, unique: true, sparse: true, immutable: true },
    description: { type: String, default: '' },
    permissions: [{ type: String, enum: PERMISSION_KEYS }]
  },
  { timestamps: true, collection: 'permission_groups' }
);

const PermissionGroup = mongoose.model('PermissionGroup', permissionGroupSchema);
PermissionGroup.PERMISSIONS = PERMISSIONS;
PermissionGroup.PERMISSION_KEYS = PERMISSION_KEYS;
// Quyền nghiệp vụ cho nhóm "toàn quyền vận hành": mọi quyền TRỪ "Giao hàng" (deliveries.perform) - quyền này
// đánh dấu tài khoản là nhân viên giao hàng (hiện trong danh sách chọn người giao), không phải quyền quản lý
// Cấu hình hóa đơn điện tử (einvoices.config) cũng loại ra - dành riêng cho kế toán trưởng
PermissionGroup.OPERATIONS_PERMISSIONS = PERMISSION_KEYS.filter((k) => !['deliveries.perform', 'einvoices.config'].includes(k));

module.exports = PermissionGroup;
