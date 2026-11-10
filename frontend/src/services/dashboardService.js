import api from './api';

export const dashboardService = {
  async getSummary() {
    const { data } = await api.get('/dashboard/summary');
    return data.data;
  },
  async getRevenueByDay(days = 7) {
    const { data } = await api.get('/dashboard/revenue-by-day', { params: { days } });
    return data.data;
  },
  async getBestSelling(limit = 5) {
    const { data } = await api.get('/dashboard/best-selling-products', { params: { limit } });
    return data.data;
  },
  async getRevenueByMonth(year) {
    const { data } = await api.get('/dashboard/revenue-by-month', { params: { year } });
    return data.data;
  },
  // params: {} = toàn thời gian; { year } = cả năm; { year, month } = 1 tháng
  async getRevenueByStore(params = {}) {
    const { data } = await api.get('/dashboard/revenue-by-store', { params });
    return data.data;
  },
  // params: { from, to } dạng YYYY-MM-DD, { storeId } (admin)
  async getAnalytics(params = {}) {
    const { data } = await api.get('/dashboard/analytics', { params });
    return data.data;
  },
  async getOrderStatusStats() {
    const { data } = await api.get('/dashboard/order-status-stats');
    return data.data;
  }
};
