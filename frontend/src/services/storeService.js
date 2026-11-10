import api from './api';

export const storeService = {
  async getStores(city) {
    const { data } = await api.get('/stores', { params: city ? { city } : {} });
    return data.data;
  },
  // Quản trị (chỉ admin): mọi chi nhánh kèm số liệu; thêm / sửa / ngưng hoạt động
  async adminList() {
    const { data } = await api.get('/stores/admin/all');
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/stores', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/stores/${id}`, payload);
    return data.data;
  },
  async deactivate(id) {
    const { data } = await api.delete(`/stores/${id}`);
    return data;
  },
  async getCities() {
    const { data } = await api.get('/stores/cities');
    return data.data;
  }
};
