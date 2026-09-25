import axios from 'axios';

// Lúc dev local dùng '/api' (Vite proxy sang backend cùng origin). Lúc deploy thật (VD: Render),
// frontend/backend nằm ở 2 domain khác nhau nên cần trỏ thẳng URL đầy đủ của backend qua biến môi
// trường build-time VITE_API_URL (khai báo trong phần Environment của Static Site trên Render).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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

// CHỈ loại trừ đúng các endpoint không nên thử refresh-rồi-gọi-lại: /auth/refresh (tránh lặp vô hạn
// khi chính refresh cũng trả 401) và /auth/login (401 ở đó nghĩa là sai mật khẩu, không phải hết
// hạn access token). Trước đây loại trừ CẢ prefix "/auth/" khiến /auth/me, /auth/change-password...
// không bao giờ được tự thử làm mới token trước khi báo lỗi, dù các endpoint này hoàn toàn cần
// access token và có thể hết hạn giống mọi API khác.
const NO_REFRESH_RETRY_PATHS = ['/auth/refresh', '/auth/login'];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    const skipRetry = NO_REFRESH_RETRY_PATHS.some((p) => originalRequest.url.includes(p));
    if (error.response?.status === 401 && !originalRequest._retry && !skipRetry) {
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
