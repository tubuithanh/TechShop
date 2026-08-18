import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { setAccessToken } from '../services/api';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Khi load lại trang, thử refresh token để khôi phục phiên đăng nhập
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        const me = await authService.getMe();
        setUser(me);
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (payload) => {
    const u = await authService.login(payload);
    setUser(u);
    return u;
  };

  const register = async (payload) => {
    const u = await authService.register(payload);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
