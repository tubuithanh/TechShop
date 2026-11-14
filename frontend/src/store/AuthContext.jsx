// =====================================================================================================
// store/AuthContext.jsx - TRẠNG THÁI ĐĂNG NHẬP dùng chung cho mọi trang (React Context).
// Component bất kỳ gọi useAuth() để biết: user hiện tại, đang tải?, và các hàm login / register / logout.
// =====================================================================================================
import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { setAccessToken } from '../services/api';
import api from '../services/api';

const AuthContext = createContext(null); // "kênh" chia sẻ dữ liệu đăng nhập

export function AuthProvider({ children }) { // bọc toàn bộ ứng dụng (xem App.jsx)
  const [user, setUser] = useState(null); // null = chưa đăng nhập
  const [loading, setLoading] = useState(true); // true trong lúc khôi phục phiên (tránh nháy sang trang đăng nhập)

  // Khi load lại trang, thử refresh token để khôi phục phiên đăng nhập
  useEffect(() => { // [] -> chỉ chạy 1 lần khi mở trang
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh'); // cookie còn hạn -> nhận access token mới
        setAccessToken(data.accessToken);
        const me = await authService.getMe(); // thông tin tài khoản (quyền, chi nhánh...)
        setUser(me);
      } catch (err) {
        setUser(null); // không có / hết phiên -> khách
      } finally {
        setLoading(false); // xong, các trang hiển thị bình thường
      }
    })();
  }, []);

  const login = async (payload) => { // { email, password }
    const u = await authService.login(payload); // lỗi (sai mật khẩu) -> ném ra cho trang đăng nhập hiển thị
    setUser(u);
    return u;
  };

  const register = async (payload) => {
    const u = await authService.register(payload);
    setUser(u);
    return u;
  };

  // SỬA LỖI: trước đây gọi /auth/logout lỗi (mất mạng) thì giao diện vẫn "đang đăng nhập" và token còn trong bộ nhớ.
  // Nay luôn xóa phiên ở trình duyệt (finally), dù server có trả lời hay không.
  const logout = async () => {
    try {
      await authService.logout(); // xóa cookie refresh token ở server
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { // dùng trong component: const { user } = useAuth()
  return useContext(AuthContext);
}
