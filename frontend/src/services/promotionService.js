import api from './api';

// Chương trình khuyến mãi tự động (chiến dịch marketing) - backend/routes/promotionRoutes.js
export const promotionService = {
  async getActive() {
    const { data } = await api.get('/promotions/active');
    return data.data;
  },
  // Admin
  async getAll(params = {}) {
    const { data } = await api.get('/promotions', { params });
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/promotions', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/promotions/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/promotions/${id}`);
    return data;
  }
};
