import api from './api';

// Báo cáo nhân viên: quản lý xem cả đội / từng người, nhân viên xem báo cáo của mình
export const staffReportService = {
  async team(params) { const { data } = await api.get('/staff-reports/team', { params }); return data.data; },
  async me(params) { const { data } = await api.get('/staff-reports/me', { params }); return data.data; },
  async staff(id, params) { const { data } = await api.get(`/staff-reports/staff/${id}`, { params }); return data.data; }
};
