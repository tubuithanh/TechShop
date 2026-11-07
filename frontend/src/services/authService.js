import api, { setAccessToken } from './api';

export const authService = {
  async requestRegisterOtp(email) {
    const { data } = await api.post('/auth/register/request-otp', { email });
    return data;
  },
  async verifyRegisterOtp(email, code) {
    const { data } = await api.post('/auth/register/verify-otp', { email, code });
    return data;
  },
  async register(payload) {
    const { data } = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    return data.user;
  },
  async login(payload) {
    const { data } = await api.post('/auth/login', payload);
    setAccessToken(data.accessToken);
    return data.user;
  },
  async zaloComplete(profile) {
    const { data } = await api.post('/auth/zalo/complete', profile);
    setAccessToken(data.accessToken);
    return data.user;
  },
  async logout() {
    await api.post('/auth/logout');
    setAccessToken(null);
  },
  async getMe() {
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
  async changePassword(payload) {
    const { data } = await api.put('/auth/change-password', payload);
    return data;
  }
};
