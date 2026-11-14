// utils/permissions.js - PHÂN QUYỀN PHÍA GIAO DIỆN: ẩn menu / chặn vào trang mà tài khoản không có quyền.
// LƯU Ý: đây chỉ là lớp "tiện" cho người dùng - backend mới là nơi chặn thật (protect / can / authorize).
//
// Ánh xạ mỗi trang quản trị (không tính các trang admin-only tuyệt đối như Cấu hình hệ thống, Nhật
// ký thao tác, Quản lý nhân viên, Nhóm quyền) sang đúng permission key tương ứng đã dùng để chặn API
// của trang đó (xem backend/models/PermissionGroup.js) - để Frontend ẩn link/chặn điều hướng khớp
// với những gì backend thực sự cho phép, thay vì chỉ dựa vào vai trò chung (admin/staff).
export const PAGE_PERMISSIONS = {
  '/admin': 'dashboard.view', // Thống kê
  '/admin/analytics': 'dashboard.view', // Phân tích
  '/admin/products': 'products.manage',
  '/admin/inventory': 'inventory.manage',
  '/admin/orders': 'orders.manage',
  '/admin/pos': 'orders.pos', // bán tại quầy
  '/admin/warranties': 'warranties.manage',
  '/admin/warranty-cards': 'warranties.manage',
  '/admin/customers': 'customers.view',
  '/admin/vouchers': 'vouchers.view',
  '/admin/promotions': 'vouchers.view',
  '/admin/reviews': 'reviews.manage',
  '/admin/articles': 'articles.manage',
  '/admin/chat': 'chat.support',
  '/admin/deliveries': 'deliveries.manage', // phân công giao hàng
  '/admin/express': 'deliveries.manage', // giao hỏa tốc
  '/admin/einvoices': 'orders.manage', // hóa đơn điện tử
  '/admin/my-deliveries': 'deliveries.perform' // đơn của shipper
  // '/admin/audit-logs' và '/admin/settings' KHÔNG có trong danh sách này - đây là các trang chỉ
  // admin mới vào được, không nhóm quyền nào cấp được (khớp với authorize('admin') ở backend).
};

// Trả về danh sách permission key mà user hiện tại có (hợp của mọi nhóm quyền đã gán) - admin trả
// về null để biểu thị "không cần kiểm tra, luôn có mọi quyền".
export function getUserPermissions(user) {
  if (!user || user.role !== 'staff') return null;
  const perms = new Set(); // Set: tự bỏ trùng khi nhiều nhóm có cùng quyền
  (user.groupIds || []).forEach((g) => (g.permissions || []).forEach((p) => {
    if (p !== 'chat.support' || g.code === 'customer_support') perms.add(p); // chat hỗ trợ: chỉ nhóm CSKH (khớp backend)
  }));
  return [...perms];
}

// Trang quản trị đầu tiên tài khoản được vào - dùng cho nút "Quản trị" và khi bị chặn ở Dashboard. Trước đây
// luôn dẫn tới /admin (cần dashboard.view): nhân viên không có quyền này (VD nhân viên giao hàng) bị đẩy về trang
// chủ, không bao giờ vào được trang của mình. Không có trang nào -> null.
export function firstAdminPath(user) {
  if (!user) return null;
  if (user.role === 'admin') return '/admin';
  if (user.role === 'staff') return '/admin/workspace'; // Dashboard theo vị trí - ai cũng vào được
  return Object.keys(PAGE_PERMISSIONS).find((path) => hasPagePermission(user, path)) || null; // khách hàng -> null
}

// Nhận diện TRƯỞNG CỬA HÀNG theo chức danh - PHẢI giống hệt backend/utils/staffRole.js (STORE_MANAGER_RE)
const STORE_MANAGER_RE = /(quản lý|trưởng|giám đốc)\s*(chi nhánh|cửa hàng|vùng|khu vực)|cửa hàng trưởng|store manager|branch manager|regional manager/i;
export const isStoreManager = (user) => user?.role === 'staff' && STORE_MANAGER_RE.test(user?.title || '');

// Kiểm tra user có quyền vào 1 trang admin cụ thể hay không (theo path đã khai báo ở PAGE_PERMISSIONS).
export function hasPagePermission(user, path) {
  if (!user) return false; // chưa đăng nhập
  if (user.role === 'admin') return true; // admin: mọi trang
  if (user.role !== 'staff') return false; // khách hàng: không trang quản trị nào
  const required = PAGE_PERMISSIONS[path];
  if (!required) return false; // path không nằm trong danh sách -> mặc định admin-only, staff không vào được
  return getUserPermissions(user).includes(required);
}
