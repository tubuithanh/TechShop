import api from './api';

export const slideService = {
  // Công khai: slide đang bật và trong thời gian hiển thị
  async getSlides() {
    const { data } = await api.get('/slides');
    return data.data;
  },
  // Quản trị (chỉ admin)
  async getAll() {
    const { data } = await api.get('/slides/admin');
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/slides', payload);
    return data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/slides/${id}`, payload);
    return data;
  },
  async remove(id) {
    const { data } = await api.delete(`/slides/${id}`);
    return data;
  },
  async reorder(ids) {
    const { data } = await api.put('/slides/reorder', { ids });
    return data;
  }
};
