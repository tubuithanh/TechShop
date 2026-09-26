/**
 * Thêm vai trò "Quản lý cửa hàng" vào dữ liệu đang có (không xóa gì, chạy lại an toàn):
 *   - nhóm quyền "Quản lý cửa hàng" (xem seed/storeManager.js)
 *   - tài khoản manager@example.com / manager123 quản lý chi nhánh "TechShop Quận 1" (hoặc chi nhánh đầu tiên)
 *
 * Chạy:        node seed/seedStoreManager.js
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/seedStoreManager.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('../models/Store');
const { ensureStoreManager, STORE_MANAGER_ACCOUNT } = require('./storeManager');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.db.databaseName);
  const store =
    (await Store.findOne({ name: 'TechShop Quận 1', isActive: { $ne: false } })) ||
    (await Store.findOne({ isActive: { $ne: false } }).sort({ createdAt: 1 }));
  if (!store) throw new Error('Chưa có cửa hàng nào trong database');
  const { group, manager } = await ensureStoreManager(store);
  console.log(`Nhóm quyền "${group.name}": ${group.permissions.join(', ')}`);
  console.log(`Tài khoản ${STORE_MANAGER_ACCOUNT.email} / ${STORE_MANAGER_ACCOUNT.password} - quản lý chi nhánh "${store.name}" (${manager.name})`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy seedStoreManager:', err);
  process.exit(1);
});
