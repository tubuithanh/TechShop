const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');

// Vai trò "Quản lý cửa hàng": điều hành 1 chi nhánh. Chỉ gồm các quyền đã được GIỚI HẠN THEO CHI NHÁNH
// (tài khoản gắn storeId chỉ thấy/sửa dữ liệu của chi nhánh mình):
//   - inventory.manage: nhập/điều chỉnh tồn kho, xem cảnh báo sắp hết hàng
//   - orders.manage:    xem và xử lý đơn hàng (xác nhận, giao, hủy, trả hàng)
//   - dashboard.view:   thống kê đơn hàng/doanh thu của chi nhánh
//   - vouchers.view:    xem các chương trình khuyến mãi đang chạy để tư vấn khách (chỉ xem)
// KHÔNG gồm các quyền phạm vi toàn hệ thống (sản phẩm, đánh giá, bảo hành, tin tức, chat, danh sách khách
// hàng) - những quyền đó không giới hạn được theo chi nhánh, cấp cho quản lý 1 chi nhánh là quá phạm vi.
const STORE_MANAGER_GROUP = {
  name: 'Quản lý cửa hàng',
  description: 'Điều hành 1 chi nhánh: tồn kho, đơn hàng và thống kê của chi nhánh được gán; xem khuyến mãi',
  permissions: ['inventory.manage', 'orders.manage', 'dashboard.view', 'vouchers.view']
};

const STORE_MANAGER_ACCOUNT = { email: 'manager@example.com', password: 'manager123' };

// Tạo (hoặc cập nhật cho đúng) nhóm quyền + tài khoản quản lý cửa hàng gắn với `store`. Idempotent.
async function ensureStoreManager(store) {
  const group = await PermissionGroup.findOneAndUpdate(
    { name: STORE_MANAGER_GROUP.name },
    { $set: { description: STORE_MANAGER_GROUP.description, permissions: STORE_MANAGER_GROUP.permissions } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  let manager = await Admin.findOne({ email: STORE_MANAGER_ACCOUNT.email });
  if (!manager) {
    manager = await Admin.create({
      name: `Quản lý ${store.name}`,
      email: STORE_MANAGER_ACCOUNT.email,
      password: STORE_MANAGER_ACCOUNT.password,
      role: 'staff',
      groupIds: [group._id],
      storeId: store._id
    });
  } else {
    await Admin.updateOne({ _id: manager._id }, { $set: { role: 'staff', groupIds: [group._id], storeId: store._id, isActive: true } });
  }
  return { group, manager };
}

module.exports = { STORE_MANAGER_GROUP, STORE_MANAGER_ACCOUNT, ensureStoreManager };
