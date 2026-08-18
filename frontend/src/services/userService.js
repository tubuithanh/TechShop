import api from './api';

export const userService = {
  async getWishlist() {
    const { data } = await api.get('/users/wishlist');
    return data.data;
  },
  async toggleWishlist(productId) {
    const { data } = await api.post(`/users/wishlist/${productId}`);
    return data;
  },
  async updateProfile(payload) {
    const { data } = await api.put('/users/profile', payload);
    return data.user;
  },
  async addAddress(payload) {
    const { data } = await api.post('/users/addresses', payload);
    return data.data;
  },
  async updateAddress(addressId, payload) {
    const { data } = await api.put(`/users/addresses/${addressId}`, payload);
    return data.data;
  },
  async deleteAddress(addressId) {
    const { data } = await api.delete(`/users/addresses/${addressId}`);
    return data.data;
  },
  async getAllCustomers(params = {}) {
    const { data } = await api.get('/users/admin/all', { params });
    return data;
  },
  async toggleCustomerActive(id) {
    const { data } = await api.put(`/users/admin/${id}/toggle-active`);
    return data;
  }
};
