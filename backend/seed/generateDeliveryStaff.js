// Local delivery QA accounts only. Does not create orders, move inventory or reset existing passwords.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveMongoUri } = require('../config/db');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Group = require('../models/PermissionGroup');
const Assignment = require('../models/StaffAssignment');
const { workingStore } = require('../utils/shipperScope');
const PASSWORD = process.env.DELIVERY_DEMO_PASSWORD || 'TestShip@123';
const DOMAIN = 'demo.techshop.test';

async function main() {
  const uri = resolveMongoUri();
  if (process.env.NODE_ENV === 'production' || !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri)) {
    throw new Error('Script chỉ tạo tài khoản demo trên MongoDB local, không chạy trên Atlas/production.');
  }
  await mongoose.connect(uri);
  const specs = [['q1', 'TechShop Quận 1'], ['cg', 'TechShop Cầu Giấy'], ['hc', 'TechShop Hải Châu']];
  const branches = [];
  for (const [code, name] of specs) {
    const store = await Store.findOne({ name, isActive: true });
    if (!store) throw new Error(`Không tìm thấy chi nhánh đang hoạt động: ${name}`);
    branches.push({ code, store });
  }
  const groups = {};
  for (const [key, label, permissions] of [
    ['manager', 'Demo local - Điều phối giao hàng', ['orders.manage', 'deliveries.manage', 'inventory.manage']],
    ['shipper', 'Demo local - Nhân viên giao hàng', ['deliveries.perform']]
  ]) {
    const code = `DEMO_DELIVERY_LOCAL_${key.toUpperCase()}`;
    let group = await Group.findOne({ code });
    if (!group) group = await Group.create({ code, name: label, description: 'Tài khoản kiểm thử giao hàng local', permissions });
    if (permissions.some(p => !group.permissions.includes(p))) throw new Error(`Nhóm ${label} đã được chỉnh quyền; cần kiểm tra trước khi dùng lại.`);
    groups[key] = group;
  }
  const accounts = [];
  const start = new Date();
  async function account(alias, name, kind, store, managedStoreIds = []) {
    const email = `${alias}@${DOMAIN}`;
    let staff = await Admin.findOne({ email }).select('+password');
    let created = false;
    if (!staff) {
      staff = await Admin.create({ email, name, password: PASSWORD, role: 'staff', isActive: true,
        title: 'Nhân viên mẫu kiểm thử giao hàng local', groupIds: [groups[kind]._id], storeId: store?._id || null, managedStoreIds });
      created = true;
      for (const [id, type] of [...(store ? [[store._id, 'home']] : []), ...managedStoreIds.map(id => [id, 'manage'])]) {
        await Assignment.create({ staffId: staff._id, storeId: id, kind: type, startDate: start, title: staff.title, reason: 'Dữ liệu mẫu local' });
      }
    }
    if (staff.role !== 'staff' || staff.title !== 'Nhân viên mẫu kiểm thử giao hàng local') throw new Error(`Email ${email} đang thuộc tài khoản khác; không ghi đè.`);
    accounts.push({ staff, created, passwordMatches: await staff.comparePassword(PASSWORD) });
    return staff;
  }
  for (const { code, store } of branches) {
    await account(`quanly.${code}`, `Demo - Quản lý ${store.name}`, 'manager', store);
    await account(`shipper1.${code}`, `Demo - Giao hàng 1 ${store.name}`, 'shipper', store);
    await account(`shipper2.${code}`, `Demo - Giao hàng 2 ${store.name}`, 'shipper', store);
  }
  await account('quanly.vung', 'Demo - Quản lý 3 chi nhánh', 'manager', branches[0].store, branches.slice(1).map(b => b.store._id));
  const transfer = await account('shipper.dieuchuyen', 'Demo - Shipper Cầu Giấy tăng cường Quận 1', 'shipper', branches[1].store);
  if (!await Assignment.exists({ staffId: transfer._id, kind: 'transfer', cancelled: false, startDate: { $lte: start }, $or: [{ endDate: null }, { endDate: { $gt: start } }] })) {
    await Assignment.create({ staffId: transfer._id, storeId: branches[0].store._id, kind: 'transfer', startDate: start,
      endDate: new Date(start.getTime() + 30 * 86400000), reason: 'Demo local: kiểm tra shipper chỉ giao ở chi nhánh đang làm việc' });
  }
  await account('shipper.chuagan', 'Demo - Shipper chưa gán chi nhánh', 'shipper', null);
  const result = [];
  for (const row of accounts) {
    const staff = await Admin.findById(row.staff._id).populate('storeId', 'name').populate('groupIds', 'permissions');
    result.push({ email: staff.email, created: row.created, passwordMatches: row.passwordMatches,
      branch: (await workingStore(staff))?.name || null, permissions: staff.groupIds.flatMap(g => g.permissions) });
  }
  console.log(JSON.stringify({ database: mongoose.connection.name, created: result.filter(r => r.created).length, accounts: result }, null, 2));
  await mongoose.disconnect();
}
main().catch(async err => { console.error(err.message); await mongoose.disconnect(); process.exitCode = 1; });
