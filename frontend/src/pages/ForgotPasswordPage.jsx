import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { authService } from '../services/authService';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { validatePassword } from '../utils/customerValidation';

// Quên mật khẩu: bước 1 nhập email nhận mã; bước 2 nhập mã + mật khẩu mới
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [devHint, setDevHint] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordError = password ? validatePassword(password) : null;
  const confirmError = confirm && confirm !== password ? 'Mật khẩu nhập lại không khớp' : null;
  const canReset = code.length === 6 && password && !passwordError && confirm === password;

  const run = async (fn) => {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  const requestCode = (e) => {
    e?.preventDefault();
    run(async () => {
      const res = await authService.requestPasswordReset(email);
      setDevHint(res.devOtpPreview || '');
      setInfo(res.message);
      setStep(2);
    });
  };

  const reset = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await authService.resetPassword({ email, code, newPassword: password, confirmPassword: confirm });
      navigate('/login', { state: { resetMessage: res.message, email } });
    });
  };

  return (
    <Container style={{ maxWidth: '28rem' }} className="py-5">
      <h1 className="fs-4 fw-bold mb-2 text-center">Quên mật khẩu</h1>
      <p className="small text-muted text-center mb-4">
        {step === 1 ? 'Nhập email tài khoản, chúng tôi sẽ gửi mã xác thực để bạn đặt mật khẩu mới.' : `Nhập mã 6 số đã gửi tới ${email} và mật khẩu mới.`}
      </p>

      {error && (
        <Alert variant="danger" className="small text-center py-2">
          {error}
        </Alert>
      )}

      {step === 1 && (
        <Form onSubmit={requestCode} className="d-flex flex-column gap-3">
          <Form.Group controlId="forgot-email">
            <Form.Label className="small fw-medium">Email</Form.Label>
            <Form.Control type="email" required value={email} autoComplete="email" placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
          </Form.Group>
          <Button type="submit" disabled={loading} className="w-100 fw-medium py-2">
            {loading ? 'Đang gửi...' : 'Gửi mã xác thực'}
          </Button>
        </Form>
      )}

      {step === 2 && (
        <Form onSubmit={reset} className="d-flex flex-column gap-3">
          {info && <Alert variant="info" className="small mb-0 py-2">{info}</Alert>}
          {devHint && (
            <Alert variant="warning" className="small mb-0 py-2">
              [Chế độ DEMO] Mã xác thực của bạn là: <strong>{devHint}</strong>
            </Alert>
          )}
          <Form.Group controlId="forgot-code">
            <Form.Label className="small fw-medium">Mã xác thực</Form.Label>
            <Form.Control
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              placeholder="Nhập mã 6 số"
              className="text-center fs-5"
              style={{ letterSpacing: '0.3em' }}
              // Lọc lấy chữ số trước rồi mới cắt 6 ký tự - dán "123 456" hay "Mã: 123456" vẫn đúng
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </Form.Group>
          <Form.Group controlId="forgot-password">
            <Form.Label className="small fw-medium">Mật khẩu mới</Form.Label>
            <InputGroup hasValidation>
              <Form.Control
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                isInvalid={!!passwordError}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button variant="outline-secondary" onClick={() => setShowPassword((v) => !v)} aria-label="Hiện/ẩn mật khẩu">
                {showPassword ? 'Ẩn' : 'Hiện'}
              </Button>
              <Form.Control.Feedback type="invalid">{passwordError}</Form.Control.Feedback>
            </InputGroup>
            <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
              Tối thiểu 8 ký tự, gồm cả chữ và số
            </Form.Text>
            <PasswordStrengthMeter password={password} />
          </Form.Group>
          <Form.Group controlId="forgot-confirm">
            <Form.Label className="small fw-medium">Nhập lại mật khẩu mới</Form.Label>
            <Form.Control
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              isInvalid={!!confirmError}
              isValid={!!confirm && !confirmError && !passwordError}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Form.Control.Feedback type="invalid">{confirmError}</Form.Control.Feedback>
          </Form.Group>
          <Button type="submit" disabled={loading || !canReset} className="w-100 fw-medium py-2">
            {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
          </Button>
          <div className="d-flex justify-content-between small">
            <Button variant="link" size="sm" className="p-0" onClick={() => setStep(1)}>
              Đổi email
            </Button>
            <Button variant="link" size="sm" className="p-0" disabled={loading} onClick={requestCode}>
              Gửi lại mã
            </Button>
          </div>
        </Form>
      )}

      <p className="small text-center mt-4">
        Nhớ mật khẩu rồi?{' '}
        <Link to="/login" className="text-primary text-decoration-underline">
          Đăng nhập
        </Link>
      </p>
    </Container>
  );
}
