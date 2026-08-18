import api from './api';

export const cartService = {
  async getCart() {
    const { data } = await api.get('/cart');
    return data.data;
  },
  async addItem(payload) {
    // payload: { productId, quantity, storeId }
    const { data } = await api.post('/cart/items', payload);
    return data.data;
  },
  async updateItem(itemId, quantity) {
    const { data } = await api.put(`/cart/items/${itemId}`, { quantity });
    return data.data;
  },
  async removeItem(itemId) {
    const { data } = await api.delete(`/cart/items/${itemId}`);
    return data.data;
  }
};
