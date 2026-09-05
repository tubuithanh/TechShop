import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';

const ZALO_ERROR_MESSAGES = {
  zalo_failed: 'Đăng nhập bằng Zalo thất bại, vui lòng thử lại',
  account_locked: 'Tài khoản Zalo này đã bị khóa'
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(ZALO_ERROR_MESSAGES[searchParams.get('error')] || '');
  const [loading, setLoading] = useState(false);

  const handleZaloLogin = () => {
    window.location.href = '/api/auth/zalo/login';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate('/');
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
          <Form.Label className="small fw-medium">Mật khẩu</Form.Label>
          <Form.Control
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Form.Group>
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
        <p className="fw-medium mb-1">Tài khoản demo:</p>
        <p className="mb-0">Khách hàng: customer@example.com / customer123</p>
        <p className="mb-0">Quản trị: admin@example.com / admin123</p>
      </div>
    </Container>
  );
}
