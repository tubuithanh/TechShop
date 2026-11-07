require('./setup');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { registerUser } = require('./helpers');

describe('Đăng ký: kiểm tra thông tin bắt buộc và địa chỉ', () => {
  test('TC-35: Số điện thoại bắt buộc, đúng định dạng di động Việt Nam, được chuẩn hóa', async () => {
    expect((await registerUser({ phoneNumber: '' })).statusCode).toBe(400);
    expect((await registerUser({ phoneNumber: 'abc' })).statusCode).toBe(400);
    expect((await registerUser({ phoneNumber: '0123456789' })).statusCode).toBe(400); // đầu số 01 không hợp lệ
    const ok = await registerUser({ phoneNumber: '+84 912.345.678' });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.user.phoneNumber).toBe('0912345678');
  });

  test('TC-36: Không cho đăng ký trùng số điện thoại (kể cả khác cách viết)', async () => {
    expect((await registerUser({ phoneNumber: '0912345678' })).statusCode).toBe(201);
    const dup = await registerUser({ phoneNumber: '+84912345678' });
    expect(dup.statusCode).toBe(409);
  });

  test('TC-37: Mật khẩu tối thiểu 8 ký tự có chữ và số; nhập lại phải khớp', async () => {
    expect((await registerUser({ password: 'abc123' })).statusCode).toBe(400); // quá ngắn
    expect((await registerUser({ password: 'chicochu' })).statusCode).toBe(400); // không có số
    expect((await registerUser({ password: '12345678' })).statusCode).toBe(400); // không có chữ
    const mismatch = await registerUser({ password: 'matkhau123', confirmPassword: 'matkhau124' });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.body.message).toMatch(/không khớp/);
  });

  test('TC-38: Họ tên 2-50 ký tự, chỉ chữ cái, bỏ khoảng trắng thừa', async () => {
    expect((await registerUser({ displayName: 'A' })).statusCode).toBe(400);
    expect((await registerUser({ displayName: 'Nguyen 123' })).statusCode).toBe(400);
    const ok = await registerUser({ displayName: '  Trần   Thị  Bích  ' });
    expect(ok.body.user.displayName).toBe('Trần Thị Bích');
  });

  test('TC-39: Lưu nhiều địa chỉ (nhà riêng, công ty...), đúng 1 địa chỉ mặc định', async () => {
    const res = await registerUser({
      addresses: [
        { label: 'Nhà riêng', addressLine1: '12 Lê Lợi', addressLine2: 'Bến Nghé, Quận 1', city: 'TP. Hồ Chí Minh' },
        { label: 'Công ty', addressLine1: '99 Nguyễn Huệ', city: 'TP. Hồ Chí Minh', isDefault: true },
        { label: 'Nhà bố mẹ', addressLine1: '5 Trần Phú', city: 'Đà Nẵng', isDefault: true }
      ]
    });
    expect(res.statusCode).toBe(201);
    const user = await User.findById(res.body.user._id);
    expect(user.addresses.map((a) => a.label)).toEqual(['Nhà riêng', 'Công ty', 'Nhà bố mẹ']);
    expect(user.addresses.filter((a) => a.isDefault).map((a) => a.label)).toEqual(['Công ty']);
  });

  test('TC-40: Địa chỉ không bắt buộc, nhưng địa chỉ đã thêm phải có số nhà và tỉnh/thành', async () => {
    const none = await registerUser();
    expect(none.statusCode).toBe(201);
    const bad = await registerUser({ addresses: [{ label: 'Công ty', addressLine1: '99 Nguyễn Huệ', city: '' }] });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.message).toMatch(/tỉnh\/thành/);
  });

  test('TC-41: Đổi số điện thoại trong hồ sơ cũng phải hợp lệ và không trùng', async () => {
    await registerUser({ phoneNumber: '0987654321' });
    const token = (await registerUser()).body.accessToken;
    const put = (phoneNumber) =>
      request(app).put('/api/users/profile').set('Authorization', `Bearer ${token}`).send({ phoneNumber });
    expect((await put('12345')).statusCode).toBe(400);
    expect((await put('0987654321')).statusCode).toBe(409);
    const ok = await put('0977 111 222');
    expect(ok.statusCode).toBe(200);
    expect(ok.body.user.phoneNumber).toBe('0977111222');
  });
});
