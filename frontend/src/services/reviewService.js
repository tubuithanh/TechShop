import api from './api';

export const reviewService = {
  async getAllAdmin(params = {}) {
    const { data } = await api.get('/reviews/admin/all', { params });
    return data;
  },
  async getStats(params = {}) {
    const { data } = await api.get('/reviews/admin/stats', { params });
    return data.data;
  },
  async reply(id, content) {
    const { data } = await api.post(`/reviews/${id}/reply`, { content });
    return data.data;
  }
};
