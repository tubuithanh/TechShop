import { io } from 'socket.io-client';
import { getAccessToken } from './api';

// Địa chỉ Socket.IO = máy chủ backend. Lúc deploy (VD: Render) frontend và backend ở 2 tên miền khác nhau:
// lấy gốc của VITE_API_URL ("https://backend.onrender.com/api" -> "https://backend.onrender.com"). Lúc dev
// để trống -> cùng địa chỉ trang, Vite chuyển tiếp /socket.io sang backend (vite.config.js).
// Trước đây cả 3 nơi gọi io('/') nên trên production luôn kết nối nhầm vào tên miền của frontend.
const apiUrl = import.meta.env.VITE_API_URL;
const SOCKET_URL = apiUrl && /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : undefined;

// auth dạng hàm: mỗi lần (tự) kết nối lại đều gửi access token MỚI NHẤT - token 15 phút đã được làm mới,
// hoặc server vừa ngắt kết nối vì đổi mật khẩu / khóa tài khoản.
export function connectSocket() {
  const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getAccessToken() }), withCredentials: true });
  // Server chủ động ngắt (khóa tài khoản / đổi mật khẩu) thì client KHÔNG tự kết nối lại - kết nối lại bằng token
  // hiện tại: tài khoản đã khóa chỉ còn kết nối ẩn danh, thiết bị vừa đổi mật khẩu vào lại đúng phòng của mình.
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 1000);
  });
  return socket;
}
