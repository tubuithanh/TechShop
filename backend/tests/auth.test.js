require('./setup');
const request = require('supertest');
const app = require('../app');
const { registerUser } = require('./helpers');

describe('Auth API', () => {
  const validUser = {
    displayName: 'Nguyễn Test',
    email: 'test@example.com',
    phoneNumber: '0900000099',
    password: '123456'
  };

  test('TC-01: Đăng ký tài khoản mới thành công', async () => {
    const res = await registerUser(validUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.accessToken).toBeDefined();
    // Không được trả về password trong response
    expect(res.body.user.password).toBeUndefined();
  });

  test('TC-02: Không cho phép yêu cầu OTP đăng ký khi email đã tồn tại', async () => {
    await registerUser(validUser);
    const res = await request(app).post('/api/auth/register/request-otp').send({ email: validUser.email });
    expect(res.statusCode).toBe(409);
  });

  test('TC-03: Từ chối đăng ký khi mật khẩu quá ngắn', async () => {
    const res = await registerUser({ ...validUser, password: '123' });
    expect(res.statusCode).toBe(400);
  });

  test('TC-04: Đăng nhập thành công với thông tin đúng', async () => {
    await registerUser(validUser);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  test('TC-05: Đăng nhập thất bại với sai mật khẩu', async () => {
    await registerUser(validUser);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'saimatkhau' });
    expect(res.statusCode).toBe(401);
  });

  test('TC-06: Truy cập /api/auth/me khi chưa đăng nhập bị từ chối (401)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });

  test('TC-07: Truy cập /api/auth/me thành công khi có token hợp lệ', async () => {
    const registerRes = await registerUser(validUser);
    const token = registerRes.body.accessToken;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
  });
});
