import api from './api';

export const productService = {
  async getProducts(params = {}) {
    const { data } = await api.get('/products', { params });
    return data;
  },
  async getProductBySlug(slug) {
    const { data } = await api.get(`/products/${slug}`);
    return data.data;
  },
  async getRelated(productId) {
    const { data } = await api.get(`/products/${productId}/related`);
    return data.data;
  },
  async compare(ids) {
    const { data } = await api.post('/products/compare', { ids });
    return data.data;
  },
  async getReviews(productId) {
    const { data } = await api.get(`/products/${productId}/reviews`);
    return data.data;
  },
  async createReview(productId, payload) {
    const { data } = await api.post(`/products/${productId}/reviews`, payload);
    return data.data;
  },
  async getQuestions(productId) {
    const { data } = await api.get(`/products/${productId}/questions`);
    return data.data;
  },
  async createQuestion(productId, content) {
    const { data } = await api.post(`/products/${productId}/questions`, { content });
    return data.data;
  },
  async answerQuestion(questionId, content) {
    const { data } = await api.post(`/products/questions/${questionId}/answers`, { content });
    return data.data;
  },
  async getCategories() {
    const { data } = await api.get('/categories');
    return data.data;
  },
  async getBrands() {
    const { data } = await api.get('/brands');
    return data.data;
  }
};
