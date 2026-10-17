import axios from 'axios';
import { io } from 'socket.io-client';
import api, { getAccessToken } from './api';

// Guest authentication is scoped to chat; it must never trigger account-login redirects.
const guestApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
const SESSION_KEY = 'techshop.chat.session';
export const getChatToken = () => sessionStorage.getItem(SESSION_KEY);
export const clearChatToken = () => sessionStorage.removeItem(SESSION_KEY);
export function ensureChatToken() {
  let token = getChatToken();
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(SESSION_KEY, token);
  }
  return token;
}
const guestConfig = () => ({ headers: { 'X-Chat-Token': getChatToken() } });
const socketOrigin = import.meta.env.VITE_API_URL
  ? new URL(import.meta.env.VITE_API_URL, window.location.origin).origin : window.location.origin;

export function createChatSocket(guest = false) {
  const socket = io(socketOrigin, { autoConnect: false, auth: guest
    ? { chatToken: getChatToken() } : { token: getAccessToken(), support: true } });
  socket.io.on('reconnect_attempt', () => {
    socket.auth = guest ? { chatToken: getChatToken() } : { token: getAccessToken(), support: true };
  });
  return socket;
}
export const mergeMessages = (previous, incoming) => Array.from(new Map(
  [...previous, ...incoming].map((m) => [String(m._id), m])
).values()).sort((a, b) => String(a._id).localeCompare(String(b._id)));
export const chatStatus = { waiting: 'Chờ tiếp nhận', active: 'Đang xử lý', closed: 'Đã kết thúc' };
export const formatChatFileSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
async function uploadFiles(id, files, guest, onUploadProgress) {
  const body = new FormData();
  body.append('clientFileIds', JSON.stringify(files.map((entry) => entry.id)));
  files.forEach((entry) => body.append('files', entry.file));
  return (await (guest ? guestApi : api).post(guest ? '/chat/guest/attachments' : `/chat/${id}/attachments`, body,
    { ...(guest ? guestConfig() : {}), onUploadProgress })).data.data;
}
export const chatService = {
  async availability() { return (await guestApi.get('/chat/availability')).data.onlineCount; },
  async start(payload) { ensureChatToken(); return (await guestApi.post('/chat/guest/start', payload, guestConfig())).data; },
  async session() { return (await guestApi.get('/chat/guest/session', guestConfig())).data; },
  async guestHistory(before) { return (await guestApi.get('/chat/guest/messages', { ...guestConfig(), params: { before } })).data; },
  async guestSend(payload) { return (await guestApi.post('/chat/guest/messages', payload, guestConfig())).data.data; },
  async guestRead() { return (await guestApi.post('/chat/guest/read', {}, guestConfig())).data.data; },
  async getHistory(id, before) { return (await api.get(`/chat/${id}/messages`, { params: { before } })).data; },
  async getConversations(status, page = 1, filters = {}) { return (await api.get('/chat', { params: { status, page, ...filters } })).data; },
  upload: uploadFiles,
  async attachment(id, attachmentId, guest = false) {
    return (await (guest ? guestApi : api).get(guest ? `/chat/guest/attachments/${attachmentId}` : `/chat/${id}/attachments/${attachmentId}`,
      { ...(guest ? guestConfig() : {}), responseType: 'blob' })).data;
  },
  async rate(payload) { return (await guestApi.post('/chat/guest/rating', payload, guestConfig())).data.data; },
  async claim(id) { return (await api.post(`/chat/${id}/claim`)).data.data; },
  async update(id, action, assignedTo) { return (await api.patch(`/chat/${id}`, { action, assignedTo })).data.data; },
  async send(id, payload) { return (await api.post(`/chat/${id}/messages`, payload)).data.data; },
  async read(id) { return (await api.post(`/chat/${id}/read`)).data.data; }
};
