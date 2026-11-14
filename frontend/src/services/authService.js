// services/authService.js - các hàm gọi API tài khoản (/api/auth/...). Hàm nào nhận access token thì lưu vào api.js.
import api, { setAccessToken } from './api';

export const authService = {
  async requestRegisterOtp(email) { // B1 đăng ký: xin mã OTP
    const { data } = await api.post('/auth/register/request-otp', { email });
    return data; // { message, devOtpPreview? }
  },
  async verifyRegisterOtp(email, code) { // B2: xác thực mã
    const { data } = await api.post('/auth/register/verify-otp', { email, code });
    return data;
  },
  async register(payload) { // B3: tạo tài khoản -> đăng nhập luôn
    const { data } = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    return data.user;
  },
  async login(payload) { // đăng nhập
    const { data } = await api.post('/auth/login', payload);
    setAccessToken(data.accessToken); // refresh token đã nằm trong cookie (server đặt)
    return data.user;
  },
  async zaloComplete(profile) { // hoàn tất đăng nhập Zalo
    const { data } = await api.post('/auth/zalo/complete', profile);
    setAccessToken(data.accessToken);
    return data.user;
  },
  async logout() {
    await api.post('/auth/logout'); // server xóa cookie
    setAccessToken(null);
  },
  async getMe() { // thông tin tài khoản đang đăng nhập
    const { data } = await api.get('/auth/me');
    return data.user;
  },
  // Quên mật khẩu: xin mã qua email, rồi đặt mật khẩu mới bằng mã đó
  async requestPasswordReset(email) {
    const { data } = await api.post('/auth/password/request-otp', { email });
    return data;
  },
  async resetPassword(payload) {
    const { data } = await api.post('/auth/password/reset', payload);
    return data;
  },
  async changePassword(payload) { // { oldPassword, newPassword } -> nhận access token mới
    const { data } = await api.put('/auth/change-password', payload);
    return data;
  }
};
