import api from './api';

export const chatService = {
  async getHistory(conversationId) {
    const { data } = await api.get(`/chat/${conversationId}`);
    return data.data;
  },
  async getConversations() {
    const { data } = await api.get('/chat');
    return data.data;
  }
};
