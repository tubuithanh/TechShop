/**
 * Tạo BỘ PHẬN KẾ TOÁN: mỗi chi nhánh đang hoạt động 1 kế toán viên + 1 KẾ TOÁN TRƯỞNG quản lý tất cả kế toán viên.
 *   - Nhóm quyền "Kế toán chi nhánh": xem đơn (không sửa), xác nhận chuyển khoản / hoàn tiền, đối soát COD,
 *     hóa đơn điện tử, xem thống kê - CHỈ chi nhánh của mình (gắn storeId).
 *   - Nhóm quyền "Kế toán trưởng": cùng quyền nhưng KHÔNG gắn chi nhánh -> thấy mọi chi nhánh; mọi kế toán viên
 *     báo cáo trực tiếp cho kế toán trưởng (managerId) -> xem được báo cáo của cả đội.
 *
 * Chạy (máy lập trình):  node seed/generateAccountants.js           (mật khẩu chung "nhanvien123")
 * Database online:       MONGO_URI=<atlas> node seed/generateAccountants.js --allow-remote --random-passwords --out=<file.csv>
 * Chạy lại nhiều lần an toàn: nhóm quyền cập nhật lại quyền; tài khoản đã có thì chỉ cập nhật chi nhánh / quản lý.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const crypto = require('crypto');
const { resolveMongoUri } = require('../config/db');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const PermissionGroup = require('../models/PermissionGroup');

const RANDOM_PW = process.argv.includes('--random-passwords');
const DEMO_PW = process.argv.includes('--demo-password'); // CHỦ Ý dùng mật khẩu demo công khai (để bấm đăng nhập nhanh ở trang đăng nhập)
const OUT_FILE = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6); // nơi ghi mật khẩu (KHÔNG commit)
const PASSWORD = 'nhanvien123';
const DOMAIN = 'techshop.vn';
const FINANCE = ['orders.view', 'finance.payments', 'finance.cod', 'einvoices.manage', 'finance.reports'];
const GROUPS = {
  store: { name: 'Kế toán chi nhánh', description: 'Xác nhận tiền chuyển khoản, hoàn tiền, đối soát COD, hóa đơn điện tử của chi nhánh; chỉ xem đơn', permissions: FINANCE },
  chief: { name: 'Kế toán trưởng', description: 'Quản lý kế toán mọi chi nhánh: tiền, đối soát, hóa đơn, cấu hình hóa đơn, báo cáo doanh thu; chỉ xem đơn', permissions: [...FINANCE, 'einvoices.config'] }
};
const NAMES = ['Phạm Thị Thanh Tâm', 'Nguyễn Hoài Thương', 'Lê Minh Nguyệt', 'Trần Quốc Bảo', 'Võ Thị Kim Liên', 'Đặng Hữu Phước', 'Huỳnh Thị Mỹ Duyên', 'Bùi Ngọc Hân'];
const CHIEF_NAME = 'Hoàng Thị Thu Trang';

// "TechShop Quận 1" / "Chi nhánh Quận 1" -> "quan-1" (phần email)
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/^((techshop|chi nhanh|cn)\s*)+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cn';
const created = []; // [{ name, email, title, password }]

async function upsertGroup(def) {
  const g = await PermissionGroup.findOne({ name: def.name });
  if (g) { g.permissions = def.permissions; g.description = def.description; await g.save(); return g; }
  return PermissionGroup.create(def);
}

async function upsertAccount({ name, email, title, groupId, storeId, managerId }) {
  // Tìm theo email; kế toán chi nhánh thì tìm thêm theo (chức danh + chi nhánh) để đổi email cũ thay vì tạo trùng
  let acc = await Admin.findOne({ email }) || (storeId ? await Admin.findOne({ title, storeId }) : null);
  if (acc && acc.email !== email && !(await Admin.exists({ email }))) acc.email = email;
  if (acc) { // đã có -> cập nhật vị trí (không đổi mật khẩu)
    Object.assign(acc, { title, groupIds: [groupId], storeId: storeId || null, managerId: managerId || null, isActive: true, role: 'staff' });
    await acc.save();
    return { acc, isNew: false };
  }
  const password = RANDOM_PW ? crypto.randomBytes(9).toString('base64url') : PASSWORD;
  acc = await Admin.create({ name, email, password, role: 'staff', title, groupIds: [groupId], storeId: storeId || null, managerId: managerId || null });
  created.push({ name, email, title, password });
  return { acc, isNew: true };
}

async function main() {
  const uri = resolveMongoUri();
  const remote = !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
  if (remote && !process.argv.includes('--allow-remote')) throw new Error('Đây là database online. Thêm --allow-remote nếu thật sự muốn ghi lên đó.');
  if (remote && !RANDOM_PW && !DEMO_PW) throw new Error('Database online: thêm --random-passwords (an toàn) hoặc --demo-password (mật khẩu demo công khai, chỉ cho bản demo).');
  if (remote && DEMO_PW) console.log('[!] Dùng mật khẩu demo công khai trên database online - ai biết đều đăng nhập được tài khoản kế toán.');
  if (remote) console.log('[!] Đang ghi lên database ONLINE:', uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@').replace(/\?.*$/, ''));
  await mongoose.connect(uri);

  const [storeGroup, chiefGroup] = [await upsertGroup(GROUPS.store), await upsertGroup(GROUPS.chief)];
  // Kế toán trưởng: KHÔNG gắn chi nhánh -> phạm vi toàn hệ thống
  const { acc: chief } = await upsertAccount({ name: CHIEF_NAME, email: `ketoantruong@${DOMAIN}`, title: 'Kế toán trưởng', groupId: chiefGroup._id });

  const stores = await Store.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
  const rows = [];
  for (const [i, st] of stores.entries()) {
    const { acc, isNew } = await upsertAccount({
      name: NAMES[i % NAMES.length], email: `ketoan.${slug(st.name)}@${DOMAIN}`, title: 'Kế toán chi nhánh',
      groupId: storeGroup._id, storeId: st._id, managerId: chief._id // báo cáo cho kế toán trưởng
    });
    rows.push(`  - ${st.name}: ${acc.name} <${acc.email}>${isNew ? ' (mới)' : ' (đã có, đã cập nhật)'}`);
  }
  console.log(`Kế toán trưởng: ${chief.name} <${chief.email}> - quản lý ${stores.length} kế toán viên`);
  console.log(rows.join('\n'));
  if (created.length) {
    if (RANDOM_PW) {
      const file = OUT_FILE || `accountant-passwords-${Date.now()}.csv`;
      fs.writeFileSync(file, ['Họ tên,Email,Chức danh,Mật khẩu', ...created.map((r) => [r.name, r.email, r.title, r.password].join(','))].join('\r\n'));
      console.log(`Mật khẩu ${created.length} tài khoản mới đã ghi vào ${file} - KHÔNG commit file này`);
    } else console.log(`Mật khẩu tài khoản mới: ${PASSWORD}`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => { console.error('Lỗi:', err.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
