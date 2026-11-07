import api from './api';

export const orderService = {
  async createOrder(payload) {
    // payload: { storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode }
    const { data } = await api.post('/orders', payload);
    return data.data;
  },
  async getMyOrders() {
    const { data } = await api.get('/orders');
    return data.data;
  },
  async getOrderById(id) {
    const { data } = await api.get(`/orders/${id}`);
    return data.data;
  },
  async cancelOrder(id, reason) {
    const { data } = await api.put(`/orders/${id}/cancel`, { reason });
    return data.data;
  },
  async getAllOrdersAdmin(params = {}) {
    const { data } = await api.get('/orders/admin/all', { params });
    return data;
  },
  async updateOrderStatus(id, status, note) {
    const { data } = await api.put(`/orders/${id}/status`, { status, note });
    return data.data;
  }
};
