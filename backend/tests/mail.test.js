require('./setup');
const request = require('supertest');
const app = require('../app');
const Otp = require('../models/Otp');
const { clearMailConfigCache } = require('../utils/mailer');

const MAIL_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'RESEND_API_KEY', 'NODE_ENV'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(MAIL_KEYS.map((k) => [k, process.env[k]]));
  clearMailConfigCache(); // cấu hình được đệm 30 giây - mỗi test đổi biến môi trường nên xóa đệm
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const requestOtp = (email) => request(app).post('/api/auth/register/request-otp').send({ email });

describe('Gửi email mã OTP đăng ký', () => {
  test('TC-53: Chưa cấu hình email -> chế độ demo, mã hiện trên màn hình (kể cả production) để vẫn đăng ký được', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = 'production';
    const res = await requestOtp('demo@example.com');
    expect(res.statusCode).toBe(200);
    expect(res.body.devOtpPreview).toMatch(/^\d{6}$/);
  });

  test('TC-54: Gửi email thất bại -> báo lỗi 502, xóa mã vừa tạo', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1'; // không có máy chủ SMTP nào ở cổng này -> gửi thất bại
    const res = await requestOtp('loi-gui@example.com');
    expect(res.statusCode).toBe(502);
    expect(res.body.message).toMatch(/Không gửi được email/);
    expect(await Otp.countDocuments({ email: 'loi-gui@example.com' })).toBe(0);
  });

  test('TC-55: Đã cấu hình email ở production -> KHÔNG trả mã về màn hình (chỉ gửi qua email)', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.NODE_ENV = 'production';
    const realFetch = global.fetch;
    const sent = [];
    global.fetch = async (url, opts) => {
      sent.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, text: async () => '' };
    };
    try {
      const res = await requestOtp('that@example.com');
      expect(res.statusCode).toBe(200);
      expect(res.body.devOtpPreview).toBeUndefined();
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe('https://api.resend.com/emails');
      expect(sent[0].body.to).toEqual(['that@example.com']);
      expect(sent[0].body.subject).toMatch(/^\d{6} là mã xác thực đăng ký/);
    } finally {
      global.fetch = realFetch;
    }
  });
});
