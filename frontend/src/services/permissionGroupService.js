import api from './api';

export const permissionGroupService = {
  async getCatalog() {
    const { data } = await api.get('/permission-groups/catalog');
    return data.data;
  },
  async getAll() {
    const { data } = await api.get('/permission-groups');
    return data.data;
  },
  async create(payload) {
    const { data } = await api.post('/permission-groups', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/permission-groups/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/permission-groups/${id}`);
    return data;
  }
};
