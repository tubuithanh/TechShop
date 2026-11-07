import api from './api';

export const reviewService = {
  async getAllAdmin(params = {}) {
    const { data } = await api.get('/reviews/admin/all', { params });
    return data;
  },
  async hide(id) {
    const { data } = await api.put(`/reviews/${id}/hide`);
    return data;
  },
  async reply(id, content) {
    const { data } = await api.post(`/reviews/${id}/reply`, { content });
    return data.data;
  }
};
