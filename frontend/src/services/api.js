// =====================================================================================================
// services/api.js - LỚP GỌI API DÙNG CHUNG cho toàn bộ frontend (thư viện axios).
//   - Tự gắn access token + chi nhánh đang làm việc vào mọi request
//   - Access token hết hạn (401) -> tự xin token mới bằng refresh token (cookie) rồi GỌI LẠI request cũ
//   - Nhiều request cùng hết hạn một lúc -> chỉ làm mới 1 lần, các request khác xếp hàng chờ
// Mọi file services/*.js đều import `api` từ đây thay vì gọi axios trực tiếp.
// =====================================================================================================
import axios from 'axios'; // thư viện gửi HTTP request

// Lúc dev local dùng '/api' (Vite proxy sang backend cùng origin). Lúc deploy thật (VD: Render),
// frontend/backend nằm ở 2 domain khác nhau nên cần trỏ thẳng URL đầy đủ của backend qua biến môi
// trường build-time VITE_API_URL (khai báo trong phần Environment của Static Site trên Render).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api', // địa chỉ gốc, VD api.get('/products') -> /api/products
  withCredentials: true // gửi kèm httpOnly cookie chứa refresh token
});

// Gắn access token vào mỗi request (lưu tạm trong bộ nhớ, không dùng localStorage để giảm rủi ro XSS)
let accessToken = null; // biến trong module: mất khi tải lại trang -> AuthContext tự xin lại bằng refresh token
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken; // socket.js dùng để kết nối real-time

// Chi nhánh đang làm việc của nhân viên quản lý nhiều chi nhánh (chọn ở thanh trên cùng trang quản trị).
// Backend chỉ chấp nhận nếu chi nhánh thuộc phạm vi của nhân viên (utils/staffScope.js), không thì bỏ qua.
export const STORE_KEY = 'techshop.workingStore'; // khóa lưu trong localStorage
export const getWorkingStore = () => {
  try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; } // trình duyệt chặn lưu trữ -> coi như chưa chọn
};
export const setWorkingStore = (id) => {
  try { if (id) localStorage.setItem(STORE_KEY, id); else localStorage.removeItem(STORE_KEY); } catch { /* trình duyệt chặn lưu trữ */ }
};

// Chạy TRƯỚC mỗi request: gắn header
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`; // header xác thực
  }
  const store = getWorkingStore();
  if (store) config.headers['X-Store-Id'] = store; // chi nhánh đang chọn (chỉ có ý nghĩa với nhân viên)
  return config;
});

// Tự động refresh access token khi hết hạn (401) rồi gọi lại request cũ
let isRefreshing = false; // đang có 1 lượt làm mới token chạy?
let pendingQueue = []; // các request 401 đang chờ lượt làm mới đó xong

// CHỈ loại trừ đúng các endpoint không nên thử refresh-rồi-gọi-lại: /auth/refresh (tránh lặp vô hạn
// khi chính refresh cũng trả 401) và /auth/login (401 ở đó nghĩa là sai mật khẩu, không phải hết
// hạn access token). Trước đây loại trừ CẢ prefix "/auth/" khiến /auth/me, /auth/change-password...
// không bao giờ được tự thử làm mới token trước khi báo lỗi, dù các endpoint này hoàn toàn cần
// access token và có thể hết hạn giống mọi API khác.
const NO_REFRESH_RETRY_PATHS = ['/auth/refresh', '/auth/login'];

// Chạy SAU mỗi phản hồi
api.interceptors.response.use(
  (res) => res, // thành công -> trả nguyên
  async (error) => {
    const originalRequest = error.config;
    // SỬA LỖI: lỗi mạng / request bị hủy có thể không có config -> trước đây originalRequest.url ném TypeError,
    // che mất lỗi gốc ("mất mạng"). Không có config thì trả lỗi gốc luôn.
    if (!originalRequest) return Promise.reject(error);
    const skipRetry = NO_REFRESH_RETRY_PATHS.some((p) => String(originalRequest.url || '').includes(p));
    if (error.response?.status === 401 && !originalRequest._retry && !skipRetry) { // hết hạn + chưa thử lại
      if (isRefreshing) { // đã có lượt làm mới đang chạy -> xếp hàng chờ
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then(() => api(originalRequest)); // làm mới xong -> gọi lại với token mới
      }
      originalRequest._retry = true; // đánh dấu: chỉ thử lại 1 lần (tránh lặp vô hạn)
      isRefreshing = true;
      // SỬA LỖI: nhớ xem trước đó CÓ phiên đăng nhập không. Khách chưa đăng nhập lỡ gọi API cần đăng nhập
      // trước đây cũng bị chuyển hẳn sang /login khi làm mới thất bại; nay chỉ chuyển người từng có phiên.
      const hadSession = Boolean(accessToken);
      try {
        const { data } = await api.post('/auth/refresh'); // xin access token mới bằng cookie
        setAccessToken(data.accessToken);
        pendingQueue.forEach((p) => p.resolve()); // cho các request đang chờ chạy tiếp
        pendingQueue = [];
        return api(originalRequest); // gọi lại request ban đầu
      } catch (refreshErr) { // refresh token cũng hết hạn / bị thu hồi
        pendingQueue.forEach((p) => p.reject(refreshErr)); // báo lỗi cho các request đang chờ
        pendingQueue = [];
        setAccessToken(null);
        if (hadSession) { // phiên vừa hết hạn -> về trang đăng nhập, nhớ trang đang mở để quay lại
          const here = window.location.pathname + window.location.search;
          window.location.href = here.startsWith('/login') ? '/login' : `/login?from=${encodeURIComponent(here)}`;
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error); // lỗi khác -> nơi gọi tự xử lý (hiện thông báo)
  }
);

export default api;
