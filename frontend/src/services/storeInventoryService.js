import api from './api';

export const storeInventoryService = {
  async checkStock(productId, storeId) {
    const { data } = await api.get('/store-inventories/check', { params: { productId, storeId } });
    return data.data;
  },
  async getInventories(params = {}) {
    const { data } = await api.get('/store-inventories', { params });
    return data.data;
  }
};
