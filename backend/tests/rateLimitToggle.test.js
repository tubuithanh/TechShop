require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const { clearRateLimitCache } = require('../middlewares/rateLimits');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-rl@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-rl@example.com', password: 'admin123' })).body.accessToken;
}
const spamOtp = async (n) => {
  let last;
  for (let i = 0; i < n; i++) {
    last = await request(app).post('/api/auth/register/request-otp').send({ email: `rl${Date.now()}${i}@example.com` });
  }
  return last;
};

beforeEach(() => clearRateLimitCache());

describe('Bật/tắt chống lạm dụng & tấn công dồn dập', () => {
  test('TC-91: Mặc định BẬT; trạng thái không lộ ra API công khai; khách hàng không xem/đổi được', async () => {
    const token = await adminToken();
    const res = await auth(request(app).get('/api/settings/security'), token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.rateLimitEnabled).toBe(true);

    expect((await request(app).get('/api/settings')).body.data).not.toHaveProperty('rateLimitEnabled');
    // Không đổi được qua API cấu hình chung
    await auth(request(app).put('/api/settings'), token).send({ rateLimitEnabled: false });
    expect((await auth(request(app).get('/api/settings/security'), token)).body.data.rateLimitEnabled).toBe(true);

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).get('/api/settings/security'), customer)).statusCode).toBe(403);
    expect((await auth(request(app).put('/api/settings/security'), customer).send({ rateLimitEnabled: false })).statusCode).toBe(403);
    expect((await auth(request(app).put('/api/settings/security'), token).send({ rateLimitEnabled: 'tat' })).statusCode).toBe(400);
  });

  test('TC-92: TẮT -> gửi dồn dập không bị chặn; BẬT lại -> quá giới hạn bị chặn 429 (áp dụng ngay)', async () => {
    const token = await adminToken();
    process.env.RATE_LIMIT_DISABLED = 'false';
    try {
      const off = await auth(request(app).put('/api/settings/security'), token).send({ rateLimitEnabled: false });
      expect(off.body.data.rateLimitEnabled).toBe(false);
      expect((await spamOtp(12)).statusCode).not.toBe(429);

      await auth(request(app).put('/api/settings/security'), token).send({ rateLimitEnabled: true });
      expect((await spamOtp(11)).statusCode).toBe(429);
    } finally {
      process.env.RATE_LIMIT_DISABLED = 'true';
    }
  });

  test('TC-93: Cấu hình số lần: mặc định giữ nguyên; đổi OTP đăng ký = 3 -> lần thứ 4 bị chặn ngay; giá trị sai bị từ chối', async () => {
    const token = await adminToken();
    const get = async () => (await auth(request(app).get('/api/settings/security'), token)).body.data;
    const values = Object.fromEntries((await get()).limits.map((l) => [l.key, l.value]));
    expect(values).toEqual({ api: 1000, login: 20, registerOtp: 10, reset: 10, order: 20, review: 20, upload: 30 });

    // Giá trị không hợp lệ
    const put = (limits) => auth(request(app).put('/api/settings/security'), token).send({ limits });
    expect((await put({ api: 50 })).statusCode).toBe(400); // API tối thiểu 100 để admin không tự khóa mình
    expect((await put({ login: 0 })).statusCode).toBe(400);
    expect((await put({ login: 2.5 })).statusCode).toBe(400);
    expect((await put({ khongCo: 5 })).statusCode).toBe(400);

    const saved = await put({ registerOtp: 3 });
    expect(saved.statusCode).toBe(200);
    const after = Object.fromEntries(saved.body.data.limits.map((l) => [l.key, l.value]));
    expect(after).toMatchObject({ registerOtp: 3, login: 20, api: 1000 }); // các mục khác giữ nguyên
    expect((await request(app).get('/api/settings')).body.data).not.toHaveProperty('rateLimits');

    process.env.RATE_LIMIT_DISABLED = 'false';
    try {
      // Nới lên 50 -> chưa bị chặn (kể cả khi test trước đã gửi vài lần cùng IP)
      await put({ registerOtp: 50 });
      expect((await spamOtp(4)).statusCode).not.toBe(429);
      // Hạ xuống 3 -> bị chặn ngay ở lần tiếp theo, không cần khởi động lại
      await put({ registerOtp: 3 });
      expect((await spamOtp(1)).statusCode).toBe(429);
    } finally {
      process.env.RATE_LIMIT_DISABLED = 'true';
    }
  });
});
