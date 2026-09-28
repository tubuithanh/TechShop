import api from './api';

export const paymentService = {
  // Tạo link thanh toán VNPay cho đơn hàng rồi chuyển trình duyệt sang cổng VNPay
  async startVnpay(orderId) {
    const { data } = await api.post(`/payments/vnpay/${orderId}`);
    window.location.href = data.data.paymentUrl;
  },
  // VNPay đã được cấu hình trên máy chủ chưa (để ẩn lựa chọn thanh toán VNPay khi chưa dùng được)
  async getVnpayStatus() {
    const { data } = await api.get('/payments/vnpay/status');
    return data.enabled;
  },
  async verifyVnpayReturn(search) {
    const { data } = await api.get(`/payments/vnpay/return${search}`);
    return data.data;
  }
};
