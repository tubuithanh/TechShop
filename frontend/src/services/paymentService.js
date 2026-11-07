import api from './api';

// Cổng thanh toán online: tạo link rồi chuyển trình duyệt sang cổng; kết quả trả về được backend kiểm tra chữ ký
export const PAYMENT_GATEWAYS = {
  vnpay: { label: 'VNPay' },
  momo: { label: 'MoMo' }
};

export const paymentService = {
  // Tạo link thanh toán cho đơn hàng (gateway: 'vnpay' | 'momo') rồi chuyển sang cổng thanh toán
  async start(gateway, orderId) {
    const { data } = await api.post(`/payments/${gateway}/${orderId}`);
    window.location.href = data.data.paymentUrl;
  },
  async startVnpay(orderId) {
    return this.start('vnpay', orderId);
  },
  // Cổng nào dùng được (ẩn cổng chưa cấu hình) + giới hạn số tiền của MoMo
  async getMethods() {
    const { data } = await api.get('/payments/methods');
    return data;
  },
  async getVnpayStatus() {
    const { data } = await api.get('/payments/vnpay/status');
    return data.enabled;
  },
  // Trang kết quả gọi lên kèm query cổng thanh toán gắn vào URL trả về
  async verifyReturn(gateway, search) {
    const { data } = await api.get(`/payments/${gateway}/return${search}`);
    return data.data;
  },
  async verifyVnpayReturn(search) {
    return this.verifyReturn('vnpay', search);
  }
};
