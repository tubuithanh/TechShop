import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Spinner } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';
import { authService } from '../services/authService';

// Backend không tự lấy hồ sơ Zalo (graph.zalo.me) vì IP của Render (server đặt ngoài Việt Nam) bị
// Zalo chặn trả về thông tin cá nhân. Thay vào đó backend chuyển access_token qua URL fragment cho
// trang này, và CHÍNH TRÌNH DUYỆT của người dùng (mang đúng IP thật, thường ở Việt Nam) gọi thẳng
// Zalo để lấy tên/ảnh đại diện - Zalo cho phép gọi từ trình duyệt (access-control-allow-origin: *).
export default function ZaloFinishPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hash.get('access_token');
      if (!accessToken) {
        navigate('/login?error=zalo_failed', { replace: true });
        return;
      }

      try {
        const url = new URL('https://graph.zalo.me/v2.0/me');
        url.searchParams.set('fields', 'id,name,picture');
        const res = await fetch(url.toString(), { headers: { access_token: accessToken } });
        const profile = await res.json();
        if (!profile.id) throw new Error(profile.message || 'Không lấy được hồ sơ Zalo');

        const user = await authService.zaloComplete(profile);
        setUser(user);
        navigate('/', { replace: true });
      } catch (err) {
        console.error('Lỗi hoàn tất đăng nhập Zalo:', err.message);
        navigate('/login?error=zalo_profile_failed', { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <Container className="py-5 d-flex flex-column align-items-center gap-3">
      <Spinner animation="border" variant="primary" />
      <p className="text-muted small mb-0">Đang hoàn tất đăng nhập bằng Zalo...</p>
    </Container>
  );
}
