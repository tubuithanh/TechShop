import api from './api';

export const collectionService = {
  async getCollections() {
    const { data } = await api.get('/collections');
    return data.data;
  },
  async getCollectionById(id) {
    const { data } = await api.get(`/collections/${id}`);
    return data.data;
  }
};
