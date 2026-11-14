// Rà soát giai đoạn 1 (nền tảng): các lỗi phát hiện khi chú thích từng dòng code
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const { strip } = require('../middlewares/sanitizeInput');

describe('Giai đoạn 1 - nền tảng', () => {
  test('P1-1: email không phải chuỗi khi xin OTP / đăng ký -> 400 (trước đây 500)', async () => {
    const a = await request(app).post('/api/auth/register/request-otp').send({ email: { a: 1 } });
    expect(a.status).toBe(400);
    const b = await request(app).post('/api/auth/register').send({ email: 123 });
    expect(b.status).toBe(400);
  });

  test('P1-2: đổi mật khẩu thiếu mật khẩu cũ -> 400 (trước đây 500)', async () => {
    await Admin.create({ name: 'A', email: 'p1@t.vn', password: 'abc12345', role: 'admin' });
    const token = (await request(app).post('/api/auth/login').send({ email: 'p1@t.vn', password: 'abc12345' })).body.accessToken;
    const res = await request(app).put('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ newPassword: 'xyz98765' });
    expect(res.status).toBe(400);
  });

  test('P1-3: khóa "$" lồng sâu hơn giới hạn không còn lọt qua', () => {
    let deep = { $where: 'x' };
    for (let i = 0; i < 15; i++) deep = { a: deep };
    const out = JSON.stringify(strip(deep));
    expect(out).not.toContain('$where');
  });
});
