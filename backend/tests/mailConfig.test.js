require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const MailConfig = require('../models/MailConfig');
const AuditLog = require('../models/AuditLog');
const { clearMailConfigCache } = require('../utils/mailer');

const SECRET = 'Mat-khau-SMTP-rat-bi-mat-123';

async function login(role) {
  const email = `${role}-mail@example.com`;
  await Admin.create({ name: role, email, password: 'admin123', role });
  return (await request(app).post('/api/auth/login').send({ email, password: 'admin123' })).body.accessToken;
}
const as = (token) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  put: (u, b) => request(app).put(u).set('Authorization', `Bearer ${token}`).send(b),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b)
});

beforeEach(() => clearMailConfigCache());

describe('Cấu hình email trong trang quản trị', () => {
  test('TC-56: Lưu SMTP: mật khẩu được mã hóa trong DB, không trả về trình duyệt, không ghi vào nhật ký', async () => {
    const admin = as(await login('admin'));
    const res = await admin.put('/api/settings/mail', {
      provider: 'smtp', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: 'shop@gmail.com', smtpPassword: SECRET, from: 'TechShop <shop@gmail.com>'
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(res.body.data.hasSmtpPassword).toBe(true);

    const doc = await MailConfig.findOne().lean();
    expect(doc.smtpPasswordEnc).toMatch(/^v1:/);
    expect(JSON.stringify(doc)).not.toContain(SECRET);

    const view = await admin.get('/api/settings/mail');
    expect(JSON.stringify(view.body)).not.toContain(SECRET);
    expect(view.body.data.smtpUser).toBe('shop@gmail.com');

    // API cấu hình CÔNG KHAI không chứa gì về email/mật khẩu
    const pub = await request(app).get('/api/settings');
    expect(JSON.stringify(pub.body)).not.toMatch(/smtp|Mat-khau/i);

    await new Promise((r) => setTimeout(r, 50)); // nhật ký ghi sau khi phản hồi xong
    expect(JSON.stringify(await AuditLog.find().lean())).not.toContain(SECRET);
  });

  test('TC-57: Để trống mật khẩu khi lưu lại -> giữ mật khẩu cũ; thiếu mật khẩu lần đầu -> báo lỗi', async () => {
    const admin = as(await login('admin'));
    const base = { provider: 'smtp', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: 'shop@gmail.com' };
    expect((await admin.put('/api/settings/mail', base)).statusCode).toBe(400);
    await admin.put('/api/settings/mail', { ...base, smtpPassword: SECRET });
    const before = (await MailConfig.findOne().lean()).smtpPasswordEnc;
    const again = await admin.put('/api/settings/mail', { ...base, smtpHost: 'smtp-mail.outlook.com', smtpPassword: '' });
    expect(again.statusCode).toBe(200);
    const after = await MailConfig.findOne().lean();
    expect(after.smtpHost).toBe('smtp-mail.outlook.com');
    expect(after.smtpPasswordEnc).toBe(before);
  });

  test('TC-58: Chỉ admin được xem/sửa/gửi thử; nhân viên và khách bị chặn', async () => {
    const staff = as(await login('staff'));
    expect((await staff.get('/api/settings/mail')).statusCode).toBe(403);
    expect((await staff.put('/api/settings/mail', { provider: 'off' })).statusCode).toBe(403);
    expect((await staff.post('/api/settings/mail/test', { provider: 'off', to: 'a@b.com' })).statusCode).toBe(403);
    expect((await request(app).get('/api/settings/mail')).statusCode).toBe(401);
  });

  test('TC-59: Gửi thử với cấu hình sai -> báo lỗi dễ hiểu; dữ liệu không hợp lệ bị từ chối', async () => {
    const admin = as(await login('admin'));
    const bad = await admin.post('/api/settings/mail/test', {
      provider: 'smtp', smtpHost: '127.0.0.1', smtpPort: 1, smtpUser: 'x@y.com', smtpPassword: 'p', to: 'nhan@example.com'
    });
    expect(bad.statusCode).toBe(502);
    expect(bad.body.message).toMatch(/không kết nối được máy chủ SMTP/);
    expect((await admin.put('/api/settings/mail', { provider: 'smtp', smtpHost: 'bad host!', smtpPort: 587 })).statusCode).toBe(400);
    expect((await admin.put('/api/settings/mail', { provider: 'khac' })).statusCode).toBe(400);
    expect((await admin.put('/api/settings/mail', { provider: 'resend', from: 'không phải email' })).statusCode).toBe(400);
  });

  test('TC-60: Cấu hình admin (Resend) được dùng để gửi OTP đăng ký, ưu tiên hơn biến môi trường', async () => {
    const admin = as(await login('admin'));
    await admin.put('/api/settings/mail', { provider: 'resend', resendApiKey: 're_admin_key', from: 'TechShop <no-reply@shop.vn>' });
    const realFetch = global.fetch;
    const sent = [];
    global.fetch = async (url, opts) => {
      sent.push({ url, auth: opts.headers.Authorization, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, text: async () => '' };
    };
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).post('/api/auth/register/request-otp').send({ email: 'khachmoi@example.com' });
      expect(res.statusCode).toBe(200);
      expect(res.body.devOtpPreview).toBeUndefined(); // đã cấu hình email -> không lộ mã ra màn hình
      expect(sent).toHaveLength(1);
      expect(sent[0].auth).toBe('Bearer re_admin_key');
      expect(sent[0].body.from).toBe('TechShop <no-reply@shop.vn>');
    } finally {
      global.fetch = realFetch;
      process.env.NODE_ENV = oldEnv;
    }
  });
});
