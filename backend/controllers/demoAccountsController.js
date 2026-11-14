// TÀI KHOẢN DEMO TRÊN TRANG ĐĂNG NHẬP: danh sách tài khoản quản trị / nhân viên đang hoạt động lấy từ database.
// Mật khẩu KHÔNG đọc được (lưu dạng băm) -> máy chủ thử so khớp với các mật khẩu demo đã biết; chỉ hiện mật khẩu khi
// khớp thật. Bật / tắt trong Admin -> Cấu hình hệ thống -> Bảo mật (mặc định: bật khi chạy local, TẮT trên production).
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Setting = require('../models/Setting');
require('../models/Store'); require('../models/PermissionGroup'); // dùng khi populate chi nhánh / nhóm quyền
const asyncHandler = require('../utils/asyncHandler');

// Mật khẩu demo công khai (seed + tài khoản demo nhân viên). Thêm mật khẩu demo mới ở đây.
const DEMO_PASSWORDS = ['admin123', 'staff123', 'manager123', 'shipper123', 'nhanvien123', 'customer123'];
const MAX = 80;
let cache = null; // { at, data } - so khớp bcrypt tốn thời gian -> lưu 10 phút

async function isEnabled() {
  const s = await Setting.findOne().select('+showDemoAccounts').lean();
  if (typeof s?.showDemoAccounts === 'boolean') return s.showDemoAccounts;
  return process.env.NODE_ENV !== 'production'; // chưa cấu hình: local bật, production tắt
}

// So khớp bcrypt chậm (~70ms/lần) -> chỉ thử tối đa 2 mật khẩu hợp lý theo email, và nhớ kết quả theo mã băm
// (đổi mật khẩu = mã băm mới = kiểm tra lại). Tài khoản cũ không phải so lại ở các lần sau.
const memo = new Map();
async function demoPassword(hash, email = '') {
  if (!hash) return null;
  if (memo.has(hash)) return memo.get(hash);
  const prefix = String(email).split('@')[0].toLowerCase();
  const guess = DEMO_PASSWORDS.find((pw) => pw === `${prefix}123`);
  const candidates = [...new Set([guess, 'nhanvien123'].filter(Boolean))];
  let found = null;
  for (const pw of candidates) if (await bcrypt.compare(pw, hash)) { found = pw; break; }
  if (memo.size > 2000) memo.clear();
  memo.set(hash, found);
  return found;
}

const KIND_ORDER = { admin: 0, manager: 1, sales: 2, warehouse: 3, delivery: 4, warranty: 5, other: 6 };
const kindOf = (a) => {
  if (a.role === 'admin') return 'admin';
  const t = String(a.title || '').toLowerCase();
  if (/quản lý|trưởng|giám đốc/.test(t) && !/kho/.test(t)) return 'manager';
  if (/kho/.test(t)) return 'warehouse';
  if (/giao hàng|shipper/.test(t)) return 'delivery';
  if (/bảo hành|kỹ thuật/.test(t)) return 'warranty';
  if (/bán hàng|thu ngân|tư vấn|cskh|chăm sóc/.test(t)) return 'sales';
  return 'other';
};

async function build() {
  const admins = await Admin.find({ isActive: { $ne: false } }).select('+password name email title role storeId managedStoreIds')
    .populate('storeId', 'name').populate('managedStoreIds', 'name').populate('groupIds', 'name').limit(300).lean();
  const rows = [];
  for (const a of admins) {
    const password = await demoPassword(a.password, a.email);
    rows.push({
      name: a.name, email: a.email, role: a.role, kind: kindOf(a), title: a.title || (a.role === 'admin' ? 'Quản trị viên' : (a.groupIds || []).map((g) => g.name).join(', ')),
      store: a.storeId?.name || '', extraStores: (a.managedStoreIds || []).map((s) => s.name).filter(Boolean), password
    });
  }
  // Ưu tiên tài khoản có mật khẩu demo dùng được, rồi theo vai trò, chi nhánh
  rows.sort((x, y) => (!!y.password - !!x.password) || (KIND_ORDER[x.kind] - KIND_ORDER[y.kind]) || x.store.localeCompare(y.store) || x.name.localeCompare(y.name));
  // Khách hàng demo (users) có mật khẩu demo
  const customers = await User.find({ isActive: { $ne: false }, email: { $in: ['customer@example.com'] } }).select('+password displayName email').lean();
  const demoCustomers = [];
  for (const c of customers) { const pw = await demoPassword(c.password, c.email); if (pw) demoCustomers.push({ name: c.displayName, email: c.email, role: 'customer', kind: 'customer', title: 'Khách hàng', store: '', extraStores: [], password: pw }); }
  return { staff: rows.slice(0, MAX), customers: demoCustomers, total: rows.length };
}

// @route GET /api/auth/demo-accounts (công khai, chỉ khi được bật)
const getDemoAccounts = asyncHandler(async (req, res) => {
  if (!(await isEnabled())) return res.json({ data: { enabled: false } });
  if (!cache || Date.now() - cache.at > 10 * 60000) cache = { at: Date.now(), data: await build() };
  res.json({ data: { enabled: true, ...cache.data } });
});

// @route GET|PUT /api/settings/demo-accounts { enabled } - admin bật / tắt
const getDemoSetting = asyncHandler(async (req, res) => {
  const s = await Setting.findOne().select('+showDemoAccounts').lean();
  res.json({ data: { enabled: await isEnabled(), configured: typeof s?.showDemoAccounts === 'boolean', production: process.env.NODE_ENV === 'production' } });
});
const updateDemoSetting = asyncHandler(async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ message: 'Giá trị bật/tắt không hợp lệ' });
  await Setting.updateOne({}, { $set: { showDemoAccounts: req.body.enabled } }, { upsert: true });
  cache = null;
  res.json({ data: { enabled: req.body.enabled, configured: true, production: process.env.NODE_ENV === 'production' }, message: req.body.enabled ? 'Đã bật hiển thị tài khoản demo' : 'Đã ẩn tài khoản demo khỏi trang đăng nhập' });
});
const clearDemoCache = () => { cache = null; };

module.exports = { getDemoAccounts, getDemoSetting, updateDemoSetting, clearDemoCache };
