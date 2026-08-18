import api from './api';

export const warrantyService = {
  async createRequest(payload) {
    const { data } = await api.post('/warranties', payload);
    return data.data;
  },
  async getMyWarranties() {
    const { data } = await api.get('/warranties');
    return data.data;
  },
  async track(code) {
    const { data } = await api.get(`/warranties/track/${code}`);
    return data.data;
  }
};
