import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';

const ZALO_ERROR_MESSAGES = {
  zalo_failed: 'Đăng nhập bằng Zalo thất bại, vui lòng thử lại',
  account_locked: 'Tài khoản Zalo này đã bị khóa',
  zalo_profile_failed: 'Không lấy được hồ sơ Zalo (tên/ảnh đại diện), vui lòng thử lại',
  zalo_complete_failed: 'Máy chủ không hoàn tất được đăng nhập bằng Zalo'
};

// Tài khoản kiểm thử hiển thị ở trang đăng nhập (bấm để điền sẵn).
// Nhân viên @techshop.vn (tạo bằng seed/generateStaff.js): khi chạy trên máy dùng mật khẩu chung "nhanvien123";
// trên máy chủ thật mỗi tài khoản có mật khẩu riêng do admin cấp - KHÔNG ghi mật khẩu thật vào mã nguồn (repo công khai).
const STAFF_DEMO_PASSWORD = import.meta.env.DEV ? 'nhanvien123' : '';
const DEMO_GROUPS = [
  {
    title: 'Khách hàng & quản trị',
    accounts: [
      ['Khách hàng', 'customer@example.com', 'customer123'],
      ['Quản trị', 'admin@example.com', 'admin123'],
      ['Nhân viên CSKH', 'staff@example.com', 'staff123'],
      ['Quản lý chi nhánh', 'manager@example.com', 'manager123'],
      ['Giao hàng', 'shipper@example.com', 'shipper123']
    ]
  },
  {
    title: 'Quản lý',
    accounts: [
      ['Quản lý vùng (mọi chi nhánh)', 'quang.nh.vung@techshop.vn'],
      ['Quản lý TechShop Quận 1', 'khoa.nm1@techshop.vn'],
      ['Quản lý TechShop Cầu Giấy', 'tai.nv9@techshop.vn'],
      ['Quản lý TechShop Hải Châu', 'son.tc17@techshop.vn'],
      ['Quản lý TechShop Cà Mau (chỉ có trên máy chủ thật)', 'vinh.tt25@techshop.vn']
    ]
  },
  {
    title: 'Nhân viên',
    accounts: [
      ['Bán hàng (Quận 1)', 'ha.ttt2@techshop.vn'],
      ['Bán hàng 2 chi nhánh', 'linh.tm.parttime@techshop.vn'],
      ['Kho (Quận 1)', 'dat.vt5@techshop.vn'],
      ['Giao hàng (Quận 1)', 'mai.dt6@techshop.vn'],
      ['Kỹ thuật bảo hành (Quận 1)', 'lan.ht8@techshop.vn']
    ]
  }
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Vừa đặt lại mật khẩu xong (từ trang Quên mật khẩu): điền sẵn email và báo thành công
  const resetMessage = location.state?.resetMessage;
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' });
  const zaloError = ZALO_ERROR_MESSAGES[searchParams.get('error')];
  const zaloReason = location.state?.zaloReason;
  // Trang cần quay lại sau khi đăng nhập (do PrivateRoute / phiên hết hạn chuyển tới). Chỉ nhận đường dẫn nội bộ
  // "/..." (không nhận "//site-khac" hay "http..." để không bị lợi dụng chuyển hướng ra ngoài)
  const fromPath = location.state?.from || searchParams.get('from') || '';
  const isInternal = fromPath.startsWith('/') && !fromPath.startsWith('//') && !fromPath.startsWith('/\\');
  const returnPath = isInternal && !fromPath.startsWith('/login') ? fromPath : '/';
  const [error, setError] = useState(zaloError ? `${zaloError}${zaloReason ? ` - Chi tiết: ${zaloReason}` : ''}` : '');
  const [loading, setLoading] = useState(false);

  const handleZaloLogin = () => {
    // Điều hướng cả trang (không phải gọi API bằng axios) nên phải ghép URL đầy đủ của backend -
    // lúc dev local VITE_API_URL không đặt, dùng lại '/api' tương đối qua Vite proxy như cũ.
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    window.location.href = `${apiBase}/auth/zalo/login`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate(returnPath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container style={{ maxWidth: '28rem' }} className="py-5">
      <h1 className="fs-4 fw-bold mb-4 text-center">Đăng nhập</h1>
      <Form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
        <Form.Group>
          <Form.Label className="small fw-medium">Email</Form.Label>
          <Form.Control
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Form.Group>
        <Form.Group>
          <div className="d-flex justify-content-between align-items-baseline">
            <Form.Label className="small fw-medium">Mật khẩu</Form.Label>
            <Link to="/forgot-password" className="small text-primary">
              Quên mật khẩu?
            </Link>
          </div>
          <Form.Control
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Form.Group>
        {resetMessage && !error && (
          <Alert variant="success" className="small py-2 mb-0">
            {resetMessage}
          </Alert>
        )}
        {error && (
          <Alert variant="danger" className="small py-2 mb-0">
            {error}
          </Alert>
        )}
        <Button type="submit" variant="primary" disabled={loading} className="w-100 fw-medium py-2">
          {loading ? 'Đang xử lý...' : 'Đăng nhập'}
        </Button>
      </Form>

      <div className="d-flex align-items-center gap-2 my-3">
        <hr className="flex-grow-1 my-0" />
        <span className="small text-muted">hoặc</span>
        <hr className="flex-grow-1 my-0" />
      </div>
      <Button
        type="button"
        variant="outline-primary"
        onClick={handleZaloLogin}
        className="w-100 fw-medium py-2 d-flex align-items-center justify-content-center gap-2"
        style={{ borderColor: '#0068ff', color: '#0068ff' }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <rect width="48" height="48" rx="10" fill="#0068ff" />
          <text x="24" y="31" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="17" fill="#fff">
            Za
          </text>
        </svg>
        Đăng nhập bằng Zalo
      </Button>

      <p className="small text-center mt-3">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="text-primary text-decoration-underline">
          Đăng ký ngay
        </Link>
      </p>
      <div className="mt-4 small text-muted bg-light rounded p-3">
        <p className="fw-medium mb-1">Tài khoản demo <span className="fw-normal">(bấm để điền sẵn)</span>:</p>
        {DEMO_GROUPS.map((g) => (
          <div key={g.title} className="mb-2">
            <div className="fw-semibold text-body mt-2">{g.title}</div>
            {g.accounts.map(([label, email, password]) => {
              const pw = password ?? STAFF_DEMO_PASSWORD;
              return (
                <button
                  key={email}
                  type="button"
                  className="btn btn-link btn-sm p-0 d-block text-start text-muted text-decoration-none w-100"
                  title="Điền vào ô đăng nhập"
                  onClick={() => { setForm({ email, password: pw }); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                >
                  <span className="text-body">{label}:</span> {email}{pw && <> / <code>{pw}</code></>}
                </button>
              );
            })}
          </div>
        ))}
        {!STAFF_DEMO_PASSWORD && (
          <p className="mb-0 mt-2" style={{ fontSize: '0.75rem' }}>
            Mật khẩu tài khoản nhân viên <code>@techshop.vn</code> trên máy chủ thật: xem danh sách quản trị viên đã cấp.
          </p>
        )}
      </div>
    </Container>
  );
}
