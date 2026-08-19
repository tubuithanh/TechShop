import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';
import { authService } from '../services/authService';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';

const STEP_EMAIL = 1;
const STEP_OTP = 2;
const STEP_INFO = 3;

export default function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(STEP_EMAIL);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [form, setForm] = useState({ displayName: '', phoneNumber: '', password: '', acceptTerms: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.requestRegisterOtp(email);
      setDevOtpHint(res.devOtpPreview || '');
      setStep(STEP_OTP);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi OTP, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.verifyRegisterOtp(email, otp);
      setStep(STEP_INFO);
    } catch (err) {
      setError(err.response?.data?.message || 'Mã OTP không đúng');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.acceptTerms) {
      setError('Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật');
      return;
    }
    setLoading(true);
    try {
      const payload = { email, ...form };
      const user = await authService.register(payload);
      setUser(user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container style={{ maxWidth: '28rem' }} className="py-5">
      <h1 className="fs-4 fw-bold mb-2 text-center">Đăng ký tài khoản</h1>

      <div className="d-flex align-items-center justify-content-center gap-2 mb-4" style={{ fontSize: '0.75rem' }}>
        {[
          { id: STEP_EMAIL, label: 'Email' },
          { id: STEP_OTP, label: 'Xác thực OTP' },
          { id: STEP_INFO, label: 'Thông tin' }
        ].map((s, idx) => (
          <div key={s.id} className="d-flex align-items-center gap-2">
            <div
              className={`rounded-circle d-flex align-items-center justify-content-center text-white ${
                step >= s.id ? 'bg-primary' : 'bg-secondary-subtle text-secondary'
              }`}
              style={{ width: '1.5rem', height: '1.5rem' }}
            >
              {idx + 1}
            </div>
            <span className={step >= s.id ? 'text-primary' : 'text-muted'}>{s.label}</span>
            {idx < 2 && <span className="text-muted">—</span>}
          </div>
        ))}
      </div>

      {error && (
        <Alert variant="danger" className="small mb-3 text-center py-2">
          {error}
        </Alert>
      )}

      {step === STEP_EMAIL && (
        <Form onSubmit={handleRequestOtp} className="d-flex flex-column gap-3">
          <Form.Group>
            <Form.Label className="small fw-medium">Email</Form.Label>
            <Form.Control
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Form.Text className="text-muted">
              Chúng tôi sẽ gửi mã xác thực (OTP) gồm 6 chữ số tới email này để xác nhận đây là email hợp lệ.
            </Form.Text>
          </Form.Group>
          <Button type="submit" variant="primary" disabled={loading} className="w-100 fw-medium py-2">
            {loading ? 'Đang gửi...' : 'Gửi mã xác thực'}
          </Button>
        </Form>
      )}

      {step === STEP_OTP && (
        <Form onSubmit={handleVerifyOtp} className="d-flex flex-column gap-3">
          <p className="small text-muted mb-0">
            Nhập mã OTP gồm 6 chữ số đã gửi tới <strong>{email}</strong>
          </p>
          {devOtpHint && (
            <Alert variant="warning" className="small mb-0 py-2">
              [Chế độ DEMO] Mã OTP của bạn là: <strong>{devOtpHint}</strong>
              <br />
              (Trong môi trường thật, mã này sẽ được gửi qua email/SMS thay vì hiển thị ở đây)
            </Alert>
          )}
          <Form.Control
            required
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="Nhập mã OTP 6 số"
            className="text-center fs-5"
            style={{ letterSpacing: '0.3em' }}
          />
          <Button type="submit" variant="primary" disabled={loading} className="w-100 fw-medium py-2">
            {loading ? 'Đang xác thực...' : 'Xác thực'}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => setStep(STEP_EMAIL)}
            className="w-100 small text-muted text-decoration-underline"
          >
            Đổi email khác / Gửi lại mã
          </Button>
        </Form>
      )}

      {step === STEP_INFO && (
        <Form onSubmit={handleFinishRegister} className="d-flex flex-column gap-3">
          <Form.Group>
            <Form.Label className="small fw-medium">Họ và tên</Form.Label>
            <Form.Control
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-medium">Số điện thoại</Form.Label>
            <Form.Control
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-medium">Mật khẩu</Form.Label>
            <Form.Control
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <PasswordStrengthMeter password={form.password} />
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="acceptTerms"
            className="text-muted"
            style={{ fontSize: '0.75rem' }}
            checked={form.acceptTerms}
            onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
            label={
              <span>
                Tôi đồng ý với{' '}
                <Link to="/terms" className="text-primary text-decoration-underline">
                  Điều khoản sử dụng
                </Link>{' '}
                và{' '}
                <Link to="/privacy" className="text-primary text-decoration-underline">
                  Chính sách bảo mật
                </Link>{' '}
                của TechShop
              </span>
            }
          />
          <Button type="submit" variant="primary" disabled={loading} className="w-100 fw-medium py-2">
            {loading ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
          </Button>
        </Form>
      )}

      <p className="small text-center mt-3">
        Đã có tài khoản?{' '}
        <Link to="/login" className="text-primary text-decoration-underline">
          Đăng nhập
        </Link>
      </p>
    </Container>
  );
}
