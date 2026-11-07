import api from './api';

export const staffService = {
  async getAll() {
    const { data } = await api.get('/staff');
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/staff', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/staff/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/staff/${id}`);
    return data;
  }
};
