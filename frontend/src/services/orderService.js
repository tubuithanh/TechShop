import api from './api';

export const orderService = {
  async createOrder(payload) {
    // payload: { storeId, deliveryAddress, deliveryMethod, paymentMode, voucherCode }
    const { data } = await api.post('/orders', payload);
    return data.data;
  },
  async getMyOrders() {
    // Existing warranty screens need the complete list, not just the first page.
    const orders = [];
    let page = 1, totalPages = 1;
    do {
      const { data } = await api.get('/orders', { params: { page, limit: 100 } });
      orders.push(...data.data);
      totalPages = data.totalPages;
      page++;
    } while (page <= totalPages);
    return orders;
  },
  async getMyOrdersPage(params) {
    const { data } = await api.get('/orders', { params });
    return data;
  },
  async getOrderById(id) {
    const { data } = await api.get(`/orders/${id}`);
    return data.data;
  },
  async cancelOrder(id, reason) {
    const { data } = await api.put(`/orders/${id}/cancel`, { reason });
    return data.data;
  },
  // Xem trước tổng tiền giỏ hàng (khuyến mãi tự động + mã giảm giá + VAT) - không tạo đơn
  async quote(payload) {
    const { data } = await api.post('/orders/quote', payload);
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
