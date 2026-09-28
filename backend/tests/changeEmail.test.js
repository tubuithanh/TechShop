require('./setup');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const { generateAccessToken } = require('../utils/generateTokens');
const { clearMailConfigCache } = require('../utils/mailer');
const { flushEmails, emailOrderStatus } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenOf = (user) => generateAccessToken({ _id: user._id, role: 'customer', tokenVersion: user.tokenVersion });

// Tài khoản giống lúc đăng nhập Zalo lần đầu: email tạm, mật khẩu ngẫu nhiên người dùng không biết
const zaloUser = (id = '8557963358561345173') =>
  User.create({ displayName: 'Bui Tu', email: `zalo${id}@zalo.techshop.local`, zaloId: id, password: 'ngaunhien-khongbiet-123' });

beforeEach(() => clearMailConfigCache());

describe('Đổi email (tài khoản Zalo dùng email tạm)', () => {
  test('TC-106: Tài khoản Zalo thêm email thật bằng mã OTP, không cần mật khẩu; sau đó dùng được "Quên mật khẩu"', async () => {
    const user = await zaloUser();
    const token = tokenOf(user);
    const me = await auth(request(app).get('/api/auth/me'), token);
    expect(me.body.user.hasPlaceholderEmail).toBe(true);

    const req1 = await auth(request(app).post('/api/auth/email/request-otp'), token).send({ email: '  Tu.Bui@Example.com ' });
    expect(req1.statusCode).toBe(200);
    const code = req1.body.devOtpPreview;
    expect(code).toMatch(/^\d{6}$/);

    expect((await auth(request(app).post('/api/auth/email/verify'), token).send({ email: 'tu.bui@example.com', code: '000000' })).statusCode).toBe(400);
    const ok = await auth(request(app).post('/api/auth/email/verify'), token).send({ email: 'tu.bui@example.com', code });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.user).toMatchObject({ email: 'tu.bui@example.com', hasPlaceholderEmail: false, zaloId: '8557963358561345173' });
    // Mã chỉ dùng 1 lần
    expect((await auth(request(app).post('/api/auth/email/verify'), token).send({ email: 'tu.bui@example.com', code })).statusCode).toBe(400);

    // Có email thật -> đặt mật khẩu qua "Quên mật khẩu" rồi đăng nhập bằng email
    const otp = await request(app).post('/api/auth/password/request-otp').send({ email: 'tu.bui@example.com' });
    await request(app).post('/api/auth/password/reset').send({ email: 'tu.bui@example.com', code: otp.body.devOtpPreview, newPassword: 'matkhau123', confirmPassword: 'matkhau123' });
    expect((await request(app).post('/api/auth/login').send({ email: 'tu.bui@example.com', password: 'matkhau123' })).statusCode).toBe(200);
  });

  test('TC-107: Tài khoản thường phải nhập đúng mật khẩu; không lấy được email của người khác; mã gắn đúng tài khoản', async () => {
    const reg = await registerUser({ email: 'thuong@example.com', password: 'matkhau123' });
    const token = reg.body.accessToken;
    await registerUser({ email: 'dacosan@example.com' });
    const send = (body, t = token) => auth(request(app).post('/api/auth/email/request-otp'), t).send(body);

    expect((await send({ email: 'moi@example.com' })).statusCode).toBe(400); // thiếu mật khẩu
    expect((await send({ email: 'moi@example.com', currentPassword: 'sai' })).statusCode).toBe(400);
    expect((await send({ email: 'dacosan@example.com', currentPassword: 'matkhau123' })).statusCode).toBe(409);
    expect((await send({ email: 'thuong@example.com', currentPassword: 'matkhau123' })).statusCode).toBe(400); // trùng email hiện tại
    expect((await send({ email: 'khong-hop-le', currentPassword: 'matkhau123' })).statusCode).toBe(400);
    expect((await send({ email: 'x@zalo.techshop.local', currentPassword: 'matkhau123' })).statusCode).toBe(400);

    const ok = await send({ email: 'moi@example.com', currentPassword: 'matkhau123' });
    expect(ok.statusCode).toBe(200);
    // Tài khoản khác không dùng được mã của người này
    const other = tokenOf(await zaloUser('111'));
    expect((await auth(request(app).post('/api/auth/email/verify'), other).send({ email: 'moi@example.com', code: ok.body.devOtpPreview })).statusCode).toBe(400);
    const done = await auth(request(app).post('/api/auth/email/verify'), token).send({ email: 'moi@example.com', code: ok.body.devOtpPreview });
    expect(done.body.user.email).toBe('moi@example.com');
    expect((await request(app).post('/api/auth/login').send({ email: 'moi@example.com', password: 'matkhau123' })).statusCode).toBe(200);
  });

  test('TC-108: Không gửi email thông báo đơn hàng tới email tạm của tài khoản Zalo (khách có email thật vẫn nhận)', async () => {
    // Chế độ demo (chưa cấu hình gửi mail): mỗi email "gửi" được in ra log dạng "[MAIL DEMO] Tới: <email>"
    const logs = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    const zalo = await zaloUser('222');
    const real = await User.create({ displayName: 'Khach That', email: 'khachthat@example.com', password: 'matkhau123' });
    for (const u of [zalo, real]) {
      emailOrderStatus(new Order({ userId: u._id, orderCode: `DH-${u._id}`, items: [], grandTotal: 0, status: 'confirmed' }), 'confirmed');
    }
    await flushEmails();
    spy.mockRestore();
    const sentTo = logs.join('\n');
    expect(sentTo).toContain('khachthat@example.com'); // đối chứng: cơ chế gửi vẫn chạy
    expect(sentTo).not.toContain('zalo.techshop.local');
  });
});
