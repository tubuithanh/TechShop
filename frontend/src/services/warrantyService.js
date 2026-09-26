import api from './api';

export const warrantyService = {
  async createRequest(payload) {
    const { data } = await api.post('/warranties', payload);
    return data.data;
  },
  async getMyWarranties() {
    const { data } = await api.get('/warranties');
    return data.data;
  },
  // Tra cứu công khai: cần mã phiếu + số điện thoại đặt hàng
  async track(code, phone) {
    const { data } = await api.get(`/warranties/track/${encodeURIComponent(code.trim())}`, { params: { phone } });
    return data.data;
  },
  async updateWarranty(id, payload) {
    const { data } = await api.put(`/warranties/${id}`, payload);
    return data.data;
  }
};
