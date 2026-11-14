// Xác định TRƯỞNG CỬA HÀNG (quản lý chi nhánh) theo chức danh - dùng cho các trang chỉ admin / trưởng cửa hàng được xem
// (VD Sức khỏe chi nhánh). Không dựa vào "chi nhánh làm thêm" (managedStoreIds) vì nhân viên thường cũng có thể làm nhiều chi nhánh,
// và không nhận nhầm "Quản lý kho" ...
const STORE_MANAGER_RE = /(quản lý|trưởng|giám đốc)\s*(chi nhánh|cửa hàng|vùng|khu vực)|cửa hàng trưởng|store manager|branch manager|regional manager/i;
const isStoreManager = (account) => account?.role === 'staff' && STORE_MANAGER_RE.test(String(account.title || ''));

module.exports = { STORE_MANAGER_RE, isStoreManager };
