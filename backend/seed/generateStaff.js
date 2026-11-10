/**
 * Dữ liệu mẫu NHÂN VIÊN cho 3 chi nhánh: quản lý, nhân viên bán hàng, kho, giao hàng, kỹ thuật bảo hành,
 * quản lý vùng (nhiều chi nhánh), nhân viên làm nhiều chi nhánh, điều chuyển tạm thời, quá trình làm việc,
 * doanh số bán tại quầy 12 tháng (để xem Hiệu suất & thưởng, Phân tích), đánh giá cuối năm trước.
 *
 * Chạy:            node seed/generateStaff.js
 * Tạo lại từ đầu:  node seed/generateStaff.js --reset   (xóa đúng dữ liệu do script này tạo rồi tạo lại)
 * Production:      MONGO_URI="<atlas>" node seed/generateStaff.js --staff-only --random-passwords --out=<file.csv>
 *                  (chỉ tạo tài khoản + nhóm quyền + quá trình làm việc; không tạo đơn giả, không sửa đơn thật;
 *                  mỗi tài khoản 1 mật khẩu ngẫu nhiên ghi ra file CSV - không commit file này)
 *
 * Mọi tài khoản mẫu: email @techshop.vn, mật khẩu "nhanvien123". Đơn bán tại quầy mẫu có mã bắt đầu "POSDEMO".
 * Chạy lại nhiều lần an toàn: tài khoản đã có thì bỏ qua, đơn mẫu đã có thì không tạo thêm.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, maskUri } = require('../config/db');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const PermissionGroup = require('../models/PermissionGroup');
const StaffAssignment = require('../models/StaffAssignment');
const StaffReview = require('../models/StaffReview');
const WarrantyCard = require('../models/WarrantyCard');
const { createCardsForOrder } = require('../utils/warrantyCards');

const STAFF_ONLY = process.argv.includes('--staff-only'); // production: chỉ tài khoản + quá trình làm việc
const RANDOM_PW = process.argv.includes('--random-passwords'); // mỗi tài khoản 1 mật khẩu ngẫu nhiên
const OUT_FILE = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6); // nơi ghi danh sách mật khẩu
const PASSWORD = 'nhanvien123';
const createdPasswords = []; // [{ name, email, title, store, password }]
const DOMAIN = 'techshop.vn';
const POS_PREFIX = 'POSDEMO';
const DAY = 86400000;
const now = new Date();
const thisYear = now.getFullYear();

// Nhóm quyền theo vị trí công việc (tìm theo tên - đã có thì cập nhật quyền, chưa có thì tạo)
const GROUPS = {
  manager: { name: 'Quản lý cửa hàng', description: 'Điều hành chi nhánh: tồn kho, đơn hàng, giao hàng, thống kê; xem khuyến mãi', permissions: ['inventory.manage', 'orders.manage', 'dashboard.view', 'vouchers.view', 'deliveries.manage'] },
  sales: { name: 'Nhân viên bán hàng', description: 'Bán tại quầy, tư vấn khách, xem khuyến mãi và thông tin khách hàng', permissions: ['orders.pos', 'vouchers.view', 'customers.view'] },
  warehouse: { name: 'Nhân viên kho', description: 'Nhập / điều chỉnh tồn kho chi nhánh', permissions: ['inventory.manage'] },
  shipper: { name: 'Giao hàng', description: 'Nhận và giao đơn được phân công', permissions: ['deliveries.perform'] },
  technician: { name: 'Kỹ thuật bảo hành', description: 'Tiếp nhận, sửa chữa máy bảo hành; bán gói gia hạn bảo hành', permissions: ['warranties.manage'] }
};
const TITLES = { manager: 'Quản lý chi nhánh', sales: 'Nhân viên bán hàng', warehouse: 'Nhân viên kho', shipper: 'Nhân viên giao hàng', technician: 'Kỹ thuật viên bảo hành' };

// Họ tên mẫu - đủ cho 3 chi nhánh
const NAMES = [
  'Nguyễn Minh Khoa', 'Trần Thị Thu Hà', 'Lê Hoàng Phúc', 'Phạm Ngọc Anh', 'Võ Thành Đạt', 'Đặng Thị Mai', 'Bùi Quốc Huy', 'Hồ Thị Lan',
  'Ngô Văn Tài', 'Dương Thị Hồng', 'Lý Gia Bảo', 'Đỗ Thị Kim Ngân', 'Huỳnh Tấn Lộc', 'Phan Thị Yến', 'Vũ Đức Thắng', 'Mai Thị Thanh',
  'Trịnh Công Sơn', 'Lâm Thị Bích', 'Tạ Minh Trí', 'Châu Thị Diễm', 'Cao Văn Nam', 'Kiều Thị Oanh', 'La Hữu Nghĩa', 'Quách Thị Hương',
  'Tôn Thất Vinh', 'Hà Thị Phương', 'Lưu Đình Khang', 'Thái Thị Ngọc',
  'Nguyễn Văn Hậu', 'Trần Bảo Châu', 'Lê Thị Như Ý', 'Phạm Quốc Việt', 'Võ Thị Hằng', 'Đinh Gia Huy', 'Bùi Thị Thảo', 'Hoàng Minh Tâm'
];
// Mỗi chi nhánh: 1 quản lý, 3 bán hàng, 1 kho, 2 giao hàng, 1 kỹ thuật
const PER_STORE = [['manager', 1], ['sales', 3], ['warehouse', 1], ['shipper', 2], ['technician', 1]];

const slugEmail = (name, i) => {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().split(' ');
  return `${plain[plain.length - 1]}.${plain.slice(0, -1).map((p) => p[0]).join('')}${i}@${DOMAIN}`;
};
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const monthsAgo = (n) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d; };

// Tên khác của cùng 1 vị trí (dữ liệu có sẵn có thể đặt tên khác) - tìm theo mọi tên trước khi tạo mới
const GROUP_ALIASES = { shipper: ['Nhân viên giao hàng'] };

// Nhóm quyền ĐÃ CÓ thì dùng nguyên (KHÔNG ghi đè quyền - trên production nhóm có thể đã được chỉnh cho người thật);
// chưa có thì tạo mới với quyền mặc định.
async function upsertGroups() {
  const out = {};
  for (const [key, g] of Object.entries(GROUPS)) {
    const names = [g.name, ...(GROUP_ALIASES[key] || [])];
    const existing = await PermissionGroup.findOne({ name: { $in: names } });
    out[key] = existing || (await PermissionGroup.create({ name: g.name, description: g.description, permissions: g.permissions }));
    console.log(`  Nhóm quyền "${out[key].name}": ${existing ? 'dùng nhóm có sẵn' : 'tạo mới'}`);
  }
  return out;
}

async function ensureAccount({ name, email, title, groupIds, storeId, managedStoreIds = [], createdAt }) {
  let acc = await Admin.findOne({ email });
  if (acc) {
    // Lần chạy trước bị lỗi không lưu được ngày vào làm (createdAt = lúc chạy script) -> sửa lại (chỉ cập nhật)
    if (now - acc.createdAt < 3 * DAY) {
      await Admin.collection.updateOne({ _id: acc._id }, { $set: { createdAt } });
      await StaffAssignment.updateMany({ staffId: acc._id, kind: { $in: ['home', 'manage'] }, startDate: { $gte: new Date(now - 3 * DAY) } }, { $set: { startDate: createdAt } });
      return { acc, created: false, joinedAt: createdAt };
    }
    return { acc, created: false, joinedAt: acc.createdAt };
  }
  const password = RANDOM_PW ? require('crypto').randomBytes(9).toString('base64url') : PASSWORD;
  acc = await Admin.create({ name, email, password, role: 'staff', title, groupIds, storeId, managedStoreIds });
  createdPasswords.push({ name, email, title, password });
  // Ngày vào làm giả lập (để quá trình làm việc có chiều dài). createdAt là trường bất biến của Mongoose nên ghi
  // thẳng qua driver; script dùng joinedAt thay vì acc.createdAt (doc trong bộ nhớ không đổi được).
  await Admin.collection.updateOne({ _id: acc._id }, { $set: { createdAt } });
  return { acc, created: true, joinedAt: createdAt };
}

async function reset() {
  const seeded = await Admin.find({ email: new RegExp(`@${DOMAIN.replace('.', '\\.')}$`) }).select('_id');
  const ids = seeded.map((a) => a._id);
  const orders = await Order.find({ orderCode: new RegExp(`^${POS_PREFIX}`) }).select('_id');
  await WarrantyCard.deleteMany({ orderId: { $in: orders.map((o) => o._id) } });
  const delOrders = await Order.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
  await StaffAssignment.deleteMany({ staffId: { $in: ids } });
  await StaffReview.deleteMany({ staffId: { $in: ids } });
  await Order.updateMany({ shipperId: { $in: ids } }, { $set: { shipperId: null } });
  const delStaff = await Admin.deleteMany({ _id: { $in: ids } });
  console.log(`Đã xóa ${delStaff.deletedCount} tài khoản mẫu, ${delOrders.deletedCount} đơn bán quầy mẫu và dữ liệu liên quan`);
}

async function main() {
  const uri = resolveMongoUri();
  await mongoose.connect(uri);
  console.log('Đã kết nối:', maskUri(uri).replace(/\?.*$/, ''), '/', mongoose.connection.db.databaseName);
  if (process.argv.includes('--reset')) await reset();

  const stores = await Store.find({ isActive: { $ne: false } }).sort({ createdAt: 1 });
  if (stores.length < 2) throw new Error('Cần ít nhất 2 chi nhánh đang hoạt động (chạy npm run seed trước)');
  const groups = await upsertGroups();

  // ----- 1. Nhân viên từng chi nhánh -----
  const staff = []; // { acc, kind, store }
  let n = 0;
  let createdCount = 0;
  for (const store of stores) {
    for (const [kind, count] of PER_STORE) {
      for (let k = 0; k < count; k++) {
        const name = NAMES[n % NAMES.length];
        const email = slugEmail(name, n + 1);
        n++;
        const { acc, created, joinedAt } = await ensureAccount({
          name, email, title: TITLES[kind], groupIds: [groups[kind]._id], storeId: store._id,
          createdAt: monthsAgo(rand(8, 30))
        });
        if (created) createdCount++;
        staff.push({ acc, kind, store, joinedAt });
      }
    }
  }

  // ----- 2. Quản lý vùng: chi nhánh chính = chi nhánh 1, quản lý thêm các chi nhánh còn lại -----
  const region = await ensureAccount({
    name: 'Nguyễn Hữu Quang', email: `quang.nh.vung@${DOMAIN}`, title: 'Quản lý vùng',
    groupIds: [groups.manager._id], storeId: stores[0]._id, managedStoreIds: stores.slice(1).map((s) => s._id),
    createdAt: monthsAgo(36)
  });
  if (region.created) createdCount++;
  staff.push({ acc: region.acc, kind: 'manager', store: stores[0], joinedAt: region.joinedAt });

  // ----- 3. Nhân viên bán hàng làm ở 2 chi nhánh (part-time luân phiên) -----
  const floater = await ensureAccount({
    name: 'Trương Mỹ Linh', email: `linh.tm.parttime@${DOMAIN}`, title: 'Nhân viên bán hàng (bán thời gian)',
    groupIds: [groups.sales._id], storeId: stores[0]._id, managedStoreIds: [stores[1]._id],
    createdAt: monthsAgo(10)
  });
  if (floater.created) createdCount++;
  staff.push({ acc: floater.acc, kind: 'sales', store: stores[0], alsoAt: stores[1], joinedAt: floater.joinedAt });
  console.log(`Tài khoản nhân viên: tạo mới ${createdCount}, tổng ${staff.length}` + (RANDOM_PW ? ' (mật khẩu ngẫu nhiên)' : ` (mật khẩu chung: ${PASSWORD})`));

  // ----- 4. Quá trình làm việc + điều chuyển tạm thời -----
  const hasHistory = await StaffAssignment.exists({ staffId: { $in: staff.map((s) => s.acc._id) } });
  if (!hasHistory) {
    const docs = [];
    for (const s of staff) {
      docs.push({ staffId: s.acc._id, storeId: s.store._id, kind: 'home', title: s.acc.title, startDate: s.joinedAt });
      for (const m of s.acc.managedStoreIds || []) {
        docs.push({ staffId: s.acc._id, storeId: m, kind: 'manage', title: s.acc.title, startDate: s.joinedAt });
      }
    }
    const byKind = (kind, store) => staff.filter((s) => s.kind === kind && String(s.store._id) === String(store._id));
    const last = stores[stores.length - 1];
    // a) Đang điều chuyển: 1 nhân viên bán hàng chi nhánh cuối -> chi nhánh 1, 6 tháng, bắt đầu 2 tháng trước
    const s1 = byKind('sales', last)[0];
    if (s1) docs.push({ staffId: s1.acc._id, storeId: stores[0]._id, kind: 'transfer', title: 'Nhân viên bán hàng', startDate: monthsAgo(2), endDate: (() => { const d = monthsAgo(2); d.setMonth(d.getMonth() + 6); return d; })(), reason: 'Tăng cường bán hàng mùa cao điểm cuối năm' });
    // b) Đã điều chuyển xong: kỹ thuật chi nhánh 2 hỗ trợ chi nhánh cuối 3 tháng đầu năm
    const s2 = byKind('technician', stores[1])[0];
    if (s2) docs.push({ staffId: s2.acc._id, storeId: last._id, kind: 'transfer', title: 'Kỹ thuật viên bảo hành', startDate: new Date(`${thisYear}-01-15T00:00:00+07:00`), endDate: new Date(`${thisYear}-04-15T00:00:00+07:00`), reason: 'Hỗ trợ trung tâm bảo hành khi thiếu kỹ thuật viên' });
    // c) Sắp điều chuyển: quản lý chi nhánh 2 sang chi nhánh cuối từ tháng sau, 3 tháng
    const s3 = byKind('manager', stores[1])[0];
    if (s3) {
      const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const end = new Date(start); end.setMonth(end.getMonth() + 3);
      docs.push({ staffId: s3.acc._id, storeId: last._id, kind: 'transfer', title: 'Quản lý chi nhánh', startDate: start, endDate: end, reason: 'Đào tạo quản lý mới cho chi nhánh' });
    }
    await StaffAssignment.insertMany(docs);
    console.log(`Quá trình làm việc: ${docs.length} giai đoạn (gồm 3 đợt điều chuyển: đang diễn ra, đã xong, sắp tới)`);
  } else {
    console.log('Quá trình làm việc: đã có, bỏ qua');
  }

  if (STAFF_ONLY) {
    console.log('--staff-only: bỏ qua đơn bán quầy mẫu, phân công giao hàng, đánh giá cuối năm (không đụng dữ liệu đơn hàng)');
  } else {
  // ----- 5. Đơn bán tại quầy 12 tháng của nhân viên bán hàng (doanh số cho Hiệu suất & Phân tích) -----
  if (await Order.exists({ orderCode: new RegExp(`^${POS_PREFIX}`) })) {
    console.log('Đơn bán quầy mẫu: đã có, bỏ qua (dùng --reset để tạo lại)');
  } else {
    const products = await Product.find({ isActive: true, 'variants.0': { $exists: true } }).select('title variants featuredImage vatRate').lean();
    if (!products.length) throw new Error('Chưa có sản phẩm (chạy npm run seed / generateProducts trước)');
    const sellers = staff.filter((s) => s.kind === 'sales');
    let made = 0;
    for (const s of sellers) {
      // Mỗi người 1 "phong độ" khác nhau để bảng xếp hạng có chênh lệch
      const skill = 0.5 + Math.random() * 1.2;
      for (let m = 11; m >= 0; m--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
        if (new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0) < s.joinedAt) continue; // chưa vào làm
        const count = Math.round(rand(3, 9) * skill);
        const batch = [];
        for (let k = 0; k < count; k++) {
          const at = new Date(monthStart.getTime() + rand(0, 27) * DAY + rand(8, 20) * 3600000);
          if (at > now || at < s.joinedAt) continue;
          const p = pick(products);
          const v = pick(p.variants.filter((x) => x.isActive !== false)) || p.variants[0];
          const qty = Math.random() < 0.85 ? 1 : 2;
          const price = v.effectivePrice ?? v.salePrice ?? v.price;
          const total = price * qty;
          // Nhân viên làm 2 chi nhánh: khoảng 40% đơn ở chi nhánh phụ
          const store = s.alsoAt && Math.random() < 0.4 ? s.alsoAt : s.store;
          batch.push({
            orderCode: `${POS_PREFIX}${at.getTime().toString(36).toUpperCase()}${rand(100, 999)}`,
            source: 'pos', createdBy: s.acc._id, createdByName: s.acc.name, storeId: store._id,
            deliveryMethod: 'store_pickup', paymentMode: Math.random() < 0.6 ? 'cash' : 'bank_transfer',
            status: 'delivered', paymentStatus: 'paid',
            deliveryAddress: { fullName: pick(['Khách lẻ', 'Anh Tuấn', 'Chị Hoa', 'Anh Dũng', 'Chị Vy', 'Anh Khôi']), phone: `09${rand(10000000, 99999999)}` },
            items: [{ productId: p._id, variantId: v._id, variantLabel: v.storage ? `${v.color} - ${v.storage}` : v.color, quantity: qty, unitPrice: price, name: p.title, image: v.image || p.featuredImage }],
            itemsTotal: total, shippingFee: 0, discountAmount: 0, grandTotal: total,
            handover: { recipientName: 'Khách', at, by: s.acc._id },
            receipt: { amount: total, at, by: s.acc._id, channel: 'counter' },
            statusHistory: [{ status: 'delivered', note: 'Bán tại quầy: đã thu tiền và bàn giao', changedBy: s.acc._id, changedAt: at }],
            createdAt: at
          });
        }
        // create() (không phải insertMany) để chạy hook tạo từ khóa tìm kiếm của đơn hàng
        const created = await Order.create(batch);
        for (const o of created) await createCardsForOrder(o, null, o.createdAt); // sổ bảo hành cho máy đã bán
        made += created.length;
      }
    }
    console.log(`Đơn bán tại quầy mẫu: ${made} đơn (kèm sổ bảo hành)`);
  }

  // ----- 6. Phân công giao hàng: gắn shipper cho đơn giao tận nơi đã giao của chi nhánh họ -----
  let assigned = 0;
  for (const store of stores) {
    const shippers = staff.filter((s) => s.kind === 'shipper' && String(s.store._id) === String(store._id));
    if (!shippers.length) continue;
    const orders = await Order.find({ storeId: store._id, deliveryMethod: 'home_delivery', status: { $in: ['delivered', 'shipping', 'returned'] }, shipperId: null }).select('_id').limit(400).lean();
    const ops = orders.map((o, i) => ({ updateOne: { filter: { _id: o._id }, update: { $set: { shipperId: shippers[i % shippers.length].acc._id } } } }));
    if (ops.length) { await Order.bulkWrite(ops); assigned += ops.length; }
  }
  console.log(`Phân công giao hàng: gắn shipper cho ${assigned} đơn giao tận nơi`);

  // ----- 7. Đánh giá cuối năm trước cho quản lý và bán hàng -----
  const lastYear = thisYear - 1;
  let reviews = 0;
  for (const s of staff.filter((x) => ['manager', 'sales', 'technician'].includes(x.kind))) {
    if (s.joinedAt > new Date(`${lastYear}-10-01T00:00:00+07:00`)) continue; // chưa làm đủ lâu năm ngoái
    if (await StaffReview.exists({ staffId: s.acc._id, year: lastYear })) continue;
    const rating = pick([3, 3, 4, 4, 4, 5, 2]);
    const base = { manager: 8000000, sales: 3000000, technician: 4000000 }[s.kind];
    await StaffReview.create({
      staffId: s.acc._id, year: lastYear, rating,
      bonus: Math.round((base * rating) / 4 / 100000) * 100000,
      strengths: pick(['Nhiệt tình, chăm sóc khách tốt', 'Nắm vững sản phẩm, tư vấn thuyết phục', 'Chủ động, hỗ trợ đồng nghiệp', 'Xử lý tình huống khéo léo']),
      improvements: pick(['Cần cải thiện tốc độ xử lý đơn', 'Nâng cao kỹ năng bán kèm phụ kiện', 'Cập nhật kiến thức sản phẩm mới thường xuyên hơn', 'Quản lý thời gian tốt hơn'])
    });
    reviews++;
  }
  console.log(`Đánh giá cuối năm ${lastYear}: ${reviews} bản`);
  }

  // Danh sách mật khẩu của tài khoản VỪA TẠO lần này (tài khoản đã có từ trước không đổi mật khẩu)
  if (createdPasswords.length && (RANDOM_PW || OUT_FILE)) {
    const file = OUT_FILE || require('path').join(process.cwd(), `staff-passwords-${Date.now()}.csv`);
    const cell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const csv = ['Họ tên,Email,Chức danh,Mật khẩu', ...createdPasswords.map((r) => [r.name, r.email, r.title, r.password].map(cell).join(','))].join('\r\n');
    require('fs').writeFileSync(file, '\uFEFF' + csv, 'utf8'); // BOM để Excel đọc đúng tiếng Việt
    console.log(`Đã ghi mật khẩu ${createdPasswords.length} tài khoản vào: ${file} (KHÔNG commit file này)`);
  }

  // Tóm tắt tài khoản để đăng nhập thử
  console.log('\nMột số tài khoản để đăng nhập thử' + (RANDOM_PW ? ' (mật khẩu: xem file CSV ở trên)' : ' (mật khẩu ' + PASSWORD + ')') + ':');
  const show = (label, s) => s && console.log(`  - ${label}: ${s.acc.email} (${s.store.name})`);
  show(`Quản lý vùng (${stores.length} chi nhánh)`, staff.find((s) => s.acc.title === 'Quản lý vùng'));
  for (const store of stores) show(`Quản lý ${store.name}`, staff.find((s) => s.kind === 'manager' && s.acc.title !== 'Quản lý vùng' && String(s.store._id) === String(store._id)));
  show('Bán hàng 2 chi nhánh', staff.find((s) => s.alsoAt));
  show('Bán hàng', staff.find((s) => s.kind === 'sales'));
  show('Kho', staff.find((s) => s.kind === 'warehouse'));
  show('Giao hàng', staff.find((s) => s.kind === 'shipper'));
  show('Kỹ thuật bảo hành', staff.find((s) => s.kind === 'technician'));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Lỗi:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
