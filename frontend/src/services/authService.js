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
  async logout() {
    await api.post('/auth/logout');
    setAccessToken(null);
  },
  async getMe() {
    const { data } = await api.get('/auth/me');
    return data.user;
  },
  async changePassword(payload) {
    const { data } = await api.put('/auth/change-password', payload);
    return data;
  }
};
