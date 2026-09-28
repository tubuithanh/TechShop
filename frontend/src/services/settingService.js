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
  // Template màu sắc giao diện (chỉ admin)
  async getThemeTemplates() {
    const { data } = await api.get('/settings/themes');
    return data.data;
  },
  async createThemeTemplate(payload) {
    const { data } = await api.post('/settings/themes', payload);
    return data;
  },
  async updateThemeTemplate(id, payload) {
    const { data } = await api.put(`/settings/themes/${id}`, payload);
    return data;
  },
  async deleteThemeTemplate(id) {
    const { data } = await api.delete(`/settings/themes/${id}`);
    return data;
  },
  // Cấu hình thanh toán VNPay (chỉ admin) - không bao giờ trả về Secret Key
  async getPaymentConfig() {
    const { data } = await api.get('/settings/payment');
    return data.data;
  },
  async updatePaymentConfig(payload) {
    const { data } = await api.put('/settings/payment', payload);
    return data;
  },
  async testPaymentConfig(payload) {
    const { data } = await api.post('/settings/payment/test', payload);
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
