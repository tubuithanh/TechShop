import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true // gửi kèm httpOnly cookie chứa refresh token
});

// Gắn access token vào mỗi request (lưu tạm trong bộ nhớ, không dùng localStorage để giảm rủi ro XSS)
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Tự động refresh access token khi hết hạn (401) rồi gọi lại request cũ
let isRefreshing = false;
let pendingQueue = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        pendingQueue.forEach((p) => p.resolve());
        pendingQueue = [];
        return api(originalRequest);
      } catch (refreshErr) {
        pendingQueue.forEach((p) => p.reject(refreshErr));
        pendingQueue = [];
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
