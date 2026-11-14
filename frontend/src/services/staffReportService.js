import api from './api';

// Báo cáo nhân viên: quản lý xem cả đội / từng người, nhân viên xem báo cáo của mình
export const staffReportService = {
  async team(params) { const { data } = await api.get('/staff-reports/team', { params }); return data.data; },
  async me(params) { const { data } = await api.get('/staff-reports/me', { params }); return data.data; },
  async staff(id, params) { const { data } = await api.get(`/staff-reports/staff/${id}`, { params }); return data.data; },
  // Phân tích bán hàng chi tiết (chỉ tiêu, khung giờ, cơ cấu, khách, chất lượng, đơn gần đây)
  async mySales(params) { const { data } = await api.get('/staff-reports/me/sales', { params }); return data.data; },
  async staffSales(id, params) { const { data } = await api.get(`/staff-reports/staff/${id}/sales`, { params }); return data.data; },
  // Đặt chỉ tiêu tháng (admin / quản lý). amount = 0 -> bỏ chỉ tiêu
  async setTarget(id, body) { const { data } = await api.put(`/staff-reports/staff/${id}/target`, body); return data; }
};
