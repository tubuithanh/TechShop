import api from './api';

export const postService = {
  async getPosts(params = {}) {
    const { data } = await api.get('/posts', { params });
    return data.data;
  },
  async getPostBySlug(slug) {
    const { data } = await api.get(`/posts/${slug}`);
    return data.data;
  },
  async addComment(postId, message) {
    const { data } = await api.post(`/posts/${postId}/comments`, { message });
    return data.data;
  },
  async getAllAdmin(params = {}) {
    const { data } = await api.get('/posts/admin/all', { params });
    return data;
  },
  async create(payload) {
    const { data } = await api.post('/posts', payload);
    return data.data;
  },
  async update(id, payload) {
    const { data } = await api.put(`/posts/${id}`, payload);
    return data.data;
  },
  async remove(id) {
    const { data } = await api.delete(`/posts/${id}`);
    return data;
  }
};
