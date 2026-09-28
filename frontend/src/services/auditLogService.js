import api from './api';

export const auditLogService = {
  async getLogs(params = {}) {
    const { data } = await api.get('/audit-logs', { params });
    return data;
  },
  async deleteAll() {
    const { data } = await api.delete('/audit-logs');
    return data;
  }
};
