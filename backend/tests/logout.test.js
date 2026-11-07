require('./setup');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { registerUser } = require('./helpers');

describe('Đăng xuất', () => {
  test('TC-124: Đăng xuất xóa cookie refresh token với cùng thuộc tính lúc đặt (HttpOnly, SameSite), làm mới token sau đó bị từ chối', async () => {
    const reg = await registerUser();
    const setCookie = reg.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    const sameSite = setCookie.match(/SameSite=(\w+)/)[1];

    const out = await request(app).post('/api/auth/logout');
    expect(out.statusCode).toBe(200);
    const cleared = out.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    expect(cleared).toMatch(/^refreshToken=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toMatch(/HttpOnly/);
    expect(cleared).toContain(`SameSite=${sameSite}`);

    // Trình duyệt đã xóa cookie -> gọi làm mới không kèm cookie thì bị từ chối
    expect((await request(app).post('/api/auth/refresh')).statusCode).toBe(401);
  });
});

describe('Đăng nhập tài khoản bị khóa', () => {
  test('TC-125: Sai mật khẩu chỉ nhận thông báo chung (không lộ trạng thái khóa); đúng mật khẩu mới báo bị khóa', async () => {
    const email = 'bi-khoa@example.com';
    await registerUser({ email, password: 'matkhau123' });
    await User.updateOne({ email }, { isActive: false });

    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'saimatkhau1' });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.body.message).toBe('Email hoặc mật khẩu không đúng');

    const right = await request(app).post('/api/auth/login').send({ email, password: 'matkhau123' });
    expect(right.statusCode).toBe(401);
    expect(right.body.message).toBe('Tài khoản đã bị khóa');
  });
});
