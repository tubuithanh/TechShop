import api from './api';

export const storeService = {
  async getStores(city) {
    const { data } = await api.get('/stores', { params: city ? { city } : {} });
    return data.data;
  },
  async getCities() {
    const { data } = await api.get('/stores/cities');
    return data.data;
  }
};
