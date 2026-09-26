import api from './api';

export const paymentService = {
  // Tạo link thanh toán VNPay cho đơn hàng rồi chuyển trình duyệt sang cổng VNPay
  async startVnpay(orderId) {
    const { data } = await api.post(`/payments/vnpay/${orderId}`);
    window.location.href = data.data.paymentUrl;
  },
  async verifyVnpayReturn(search) {
    const { data } = await api.get(`/payments/vnpay/return${search}`);
    return data.data;
  }
};
