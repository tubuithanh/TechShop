import api from './api';

export const voucherService = {
  async validate(code, orderValue) {
    const { data } = await api.post('/vouchers/validate', { code, orderValue });
    return data.data;
  },
  // Admin
  async getAll() {
    const { data } = await api.get('/vouchers');
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/vouchers', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/vouchers/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/vouchers/${id}`);
    return data;
  }
};
