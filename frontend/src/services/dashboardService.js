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
  async getRevenueByStore() {
    const { data } = await api.get('/dashboard/revenue-by-store');
    return data.data;
  },
  async getOrderStatusStats() {
    const { data } = await api.get('/dashboard/order-status-stats');
    return data.data;
  }
};
