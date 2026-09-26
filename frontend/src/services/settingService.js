import api from './api';

export const settingService = {
  async getSettings() {
    const { data } = await api.get('/settings');
    return data.data;
  },
  async updateSettings(payload) {
    const { data } = await api.put('/settings', payload);
    return data.data;
  },
  // Cấu hình gửi email (chỉ admin) - không bao giờ trả về mật khẩu/API key
  async getMailConfig() {
    const { data } = await api.get('/settings/mail');
    return data.data;
  },
  async updateMailConfig(payload) {
    const { data } = await api.put('/settings/mail', payload);
    return data;
  },
  async testMailConfig(payload) {
    const { data } = await api.post('/settings/mail/test', payload);
    return data;
  },
  // Gmail API: lấy link đăng nhập Google để cấp quyền gửi email / ngắt kết nối
  async startGmailConnect() {
    const { data } = await api.post('/settings/mail/gmail/connect');
    return data.data.url;
  },
  async disconnectGmail() {
    const { data } = await api.post('/settings/mail/gmail/disconnect');
    return data;
  }
};
