import api from './api';

export const settingService = {
  async getSettings() {
    const { data } = await api.get('/settings');
    return data.data;
  },
  async updateSettings(payload) {
    const { data } = await api.put('/settings', payload);
    return data.data;
  }
};
