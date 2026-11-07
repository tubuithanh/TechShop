const request = require('supertest');
const app = require('../app');

// Đăng ký tài khoản qua đúng luồng OTP thực tế (request-otp -> verify-otp -> register).
// `devOtpPreview` chỉ được trả về khi NODE_ENV !== 'production' (setup.js đã set NODE_ENV='test').
async function registerUser(overrides = {}) {
  const defaultUser = {
    displayName: 'Test User',
    email: `user${Date.now()}${Math.floor(Math.random() * 100000)}@example.com`,
    // Mỗi tài khoản cần 1 số điện thoại riêng (số điện thoại không được trùng)
    phoneNumber: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    password: 'matkhau123'
  };
  const user = { ...defaultUser, ...overrides };

  const otpRes = await request(app).post('/api/auth/register/request-otp').send({ email: user.email });
  await request(app)
    .post('/api/auth/register/verify-otp')
    .send({ email: user.email, code: otpRes.body.devOtpPreview });

  return request(app)
    .post('/api/auth/register')
    .send({ confirmPassword: user.password, acceptTerms: true, ...user });
}

module.exports = { registerUser };
