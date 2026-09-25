// Ánh xạ mỗi trang quản trị (không tính các trang admin-only tuyệt đối như Cấu hình hệ thống, Nhật
// ký thao tác, Quản lý nhân viên, Nhóm quyền) sang đúng permission key tương ứng đã dùng để chặn API
// của trang đó (xem backend/models/PermissionGroup.js) - để Frontend ẩn link/chặn điều hướng khớp
// với những gì backend thực sự cho phép, thay vì chỉ dựa vào vai trò chung (admin/staff).
export const PAGE_PERMISSIONS = {
  '/admin': 'dashboard.view',
  '/admin/products': 'products.manage',
  '/admin/inventory': 'inventory.manage',
  '/admin/orders': 'orders.manage',
  '/admin/warranties': 'warranties.manage',
  '/admin/customers': 'customers.view',
  '/admin/vouchers': 'vouchers.view',
  '/admin/reviews': 'reviews.manage',
  '/admin/articles': 'articles.manage',
  '/admin/chat': 'chat.support'
  // '/admin/audit-logs' và '/admin/settings' KHÔNG có trong danh sách này - đây là các trang chỉ
  // admin mới vào được, không nhóm quyền nào cấp được (khớp với authorize('admin') ở backend).
};

// Trả về danh sách permission key mà user hiện tại có (hợp của mọi nhóm quyền đã gán) - admin trả
// về null để biểu thị "không cần kiểm tra, luôn có mọi quyền".
export function getUserPermissions(user) {
  if (!user || user.role !== 'staff') return null;
  const perms = new Set();
  (user.groupIds || []).forEach((g) => (g.permissions || []).forEach((p) => perms.add(p)));
  return [...perms];
}

// Kiểm tra user có quyền vào 1 trang admin cụ thể hay không (theo path đã khai báo ở PAGE_PERMISSIONS).
export function hasPagePermission(user, path) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  const required = PAGE_PERMISSIONS[path];
  if (!required) return false; // path không nằm trong danh sách -> mặc định admin-only, staff không vào được
  return getUserPermissions(user).includes(required);
}
