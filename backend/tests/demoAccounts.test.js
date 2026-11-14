// Tài khoản demo ở trang đăng nhập: lấy từ database, chỉ hiện mật khẩu demo đã xác minh, admin bật / tắt được
require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const { clearDemoCache } = require('../controllers/demoAccountsController');

test('DEMO-1: Liệt kê tài khoản quản trị / nhân viên; chỉ lộ mật khẩu demo; tài khoản khóa không hiện; admin tắt được', async () => {
  const admin = await Admin.create({ name: 'Quản trị', email: 'admin@example.com', password: 'admin123', role: 'admin' });
  await Admin.create({ name: 'Nhân viên demo', email: 'nv.demo@techshop.vn', password: 'nhanvien123', role: 'staff', title: 'Nhân viên bán hàng' });
  await Admin.create({ name: 'Mật khẩu riêng', email: 'rieng@techshop.vn', password: 'Bimat@2026', role: 'staff', title: 'Quản lý chi nhánh' });
  await Admin.create({ name: 'Đã nghỉ', email: 'nghi@techshop.vn', password: 'nhanvien123', role: 'staff', isActive: false });
  clearDemoCache();
  const d = (await request(app).get('/api/auth/demo-accounts')).body.data;
  expect(d.enabled).toBe(true); // chạy test (không phải production) -> mặc định bật
  const by = Object.fromEntries(d.staff.map((a) => [a.email, a]));
  expect(by['admin@example.com']).toMatchObject({ kind: 'admin', password: 'admin123' });
  expect(by['nv.demo@techshop.vn']).toMatchObject({ kind: 'sales', password: 'nhanvien123' });
  expect(by['rieng@techshop.vn'].password).toBeNull(); // mật khẩu riêng không bao giờ lộ
  expect(by['nghi@techshop.vn']).toBeUndefined();     // tài khoản khóa không hiện
  expect(JSON.stringify(d)).not.toContain('Bimat@2026');
  expect(JSON.stringify(d)).not.toMatch(/\$2[aby]\$/);   // không lộ mã băm

  const token = jwt.sign({ id: String(admin._id), role: 'admin' }, process.env.JWT_ACCESS_SECRET);
  expect((await request(app).put('/api/settings/demo-accounts').set('Authorization', `Bearer ${token}`).send({ enabled: false })).status).toBe(200);
  expect((await request(app).get('/api/auth/demo-accounts')).body.data).toEqual({ enabled: false });
});
