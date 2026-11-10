import api from './api';

// Sổ bảo hành điện tử - backend/routes/warrantyCardRoutes.js
export const warrantyCardService = {
  // Công khai: q = mã sổ bảo hành / IMEI / mã đơn hàng
  async lookup(q, phone) {
    const { data } = await api.get('/warranty-cards/lookup', { params: { q, phone } });
    return data.data;
  },
  // Khách hàng
  async mine() {
    const { data } = await api.get('/warranty-cards/mine');
    return data.data;
  },
  async activate(id) {
    const { data } = await api.post(`/warranty-cards/${id}/activate`);
    return data.data;
  },
  async plans(id) {
    const { data } = await api.get(`/warranty-cards/${id}/plans`);
    return data.data;
  },
  async requestExtension(id, planId, channel) {
    const { data } = await api.post(`/warranty-cards/${id}/extensions`, { planId, channel });
    return data.data;
  },
  async cancelExtension(id, extId) {
    const { data } = await api.delete(`/warranty-cards/${id}/extensions/${extId}`);
    return data.data;
  },
  // Quản trị
  async adminList(params = {}) {
    const { data } = await api.get('/warranty-cards/admin', { params });
    return data;
  },
  async adminUpdate(id, payload) {
    const { data } = await api.put(`/warranty-cards/admin/${id}`, payload);
    return data.data;
  },
  async adminPlans(id) {
    const { data } = await api.get(`/warranty-cards/admin/${id}/plans`);
    return data.data;
  },
  async adminSell(id, planId, channel) {
    const { data } = await api.post(`/warranty-cards/admin/${id}/extensions`, { planId, channel, paymentConfirmed: true });
    return data.data;
  },
  async adminConfirm(id, extId, note) {
    const { data } = await api.post(`/warranty-cards/admin/${id}/extensions/${extId}/confirm`, { note });
    return data.data;
  },
  async adminCancel(id, extId, note) {
    const { data } = await api.post(`/warranty-cards/admin/${id}/extensions/${extId}/cancel`, { note });
    return data.data;
  },
  // Gói gia hạn & trung tâm bảo hành hãng (chỉ admin)
  async listPlans() {
    const { data } = await api.get('/warranty-cards/admin/plans');
    return data.data;
  },
  async savePlan(id, payload) {
    const { data } = id ? await api.put(`/warranty-cards/admin/plans/${id}`, payload) : await api.post('/warranty-cards/admin/plans', payload);
    return data.data;
  },
  async saveBrandCenter(brandId, payload) {
    const { data } = await api.put(`/warranty-cards/admin/brands/${brandId}/center`, payload);
    return data.data;
  }
};
