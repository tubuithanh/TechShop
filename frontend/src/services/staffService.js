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
  // Quá trình làm việc, điều chuyển, hiệu suất, đánh giá cuối năm (backend/controllers/staffWorkController.js)
  async assignments(id) {
    const { data } = await api.get(`/staff/${id}/assignments`);
    return data.data;
  },
  async transfer(id, payload) {
    const { data } = await api.post(`/staff/${id}/transfers`, payload);
    return data.data;
  },
  async endTransfer(id, aid, note) {
    const { data } = await api.post(`/staff/${id}/transfers/${aid}/end`, { note });
    return data.data;
  },
  async performance(id, year) {
    const { data } = await api.get(`/staff/${id}/performance`, { params: { year } });
    return data.data;
  },
  async performanceSummary(year) {
    const { data } = await api.get('/staff/performance/summary', { params: { year } });
    return data.data;
  },
  async saveReview(id, year, payload) {
    const { data } = await api.put(`/staff/${id}/reviews/${year}`, payload);
    return data.data;
  },
  // Nhân viên theo chi nhánh (nhiều - nhiều)
  async byStore(storeId) {
    const { data } = await api.get(`/staff/by-store/${storeId}`);
    return data.data;
  },
  async addToStore(storeId, staffId) {
    const { data } = await api.post(`/staff/by-store/${storeId}`, { staffId });
    return data.data;
  },
  async removeFromStore(storeId, staffId) {
    const { data } = await api.delete(`/staff/by-store/${storeId}/${staffId}`);
    return data;
  },
  async remove(id) {
    const { data } = await api.delete(`/staff/${id}`);
    return data;
  }
};
