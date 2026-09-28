import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap';
import api from '../services/api';

// Ô email ở trang Thông tin tài khoản + form đổi email xác thực bằng mã OTP gửi tới email MỚI.
// - Chưa có email (tài khoản đăng nhập bằng Zalo): hiện "Chưa có email", không cần mật khẩu
// - Tài khoản thường: phải nhập mật khẩu hiện tại
export default function ChangeEmailBox({ user, onChanged }) {
  const placeholder = !user?.email; // chưa có email
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { variant, text }

  const reset = () => {
    setOpen(false);
    setStep('email');
    setEmail('');
    setPassword('');
    setCode('');
    setMsg(null);
  };

  const requestCode = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post('/auth/email/request-otp', { email, ...(placeholder ? {} : { currentPassword: password }) });
      setStep('code');
      setMsg({ variant: 'info', text: data.devOtpPreview ? `${data.message}. Mã (chế độ demo): ${data.devOtpPreview}` : data.message });
    } catch (err) {
      setMsg({ variant: 'danger', text: err.response?.data?.message || 'Không gửi được mã, vui lòng thử lại' });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post('/auth/email/verify', { email, code });
      onChanged(data.user);
      reset();
      setMsg({ variant: 'success', text: data.message });
    } catch (err) {
      setMsg({ variant: 'danger', text: err.response?.data?.message || 'Xác nhận thất bại' });
    } finally {
      setBusy(false);
    }
  };

  // Chặn Enter gửi form hồ sơ bên ngoài
  const noSubmit = (fn) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    }
  };

  return (
    <Form.Group className="mb-3">
      <Form.Label className="small text-muted" htmlFor="profile-email">
        Email
      </Form.Label>
      <InputGroup>
        <Form.Control
          id="profile-email"
          disabled
          value={placeholder ? 'Chưa có email (tài khoản đăng nhập bằng Zalo)' : user?.email || ''}
          className={`bg-light ${placeholder ? 'fst-italic text-muted' : ''}`}
        />
        {!open && (
          <Button variant="outline-primary" onClick={() => setOpen(true)}>
            {placeholder ? 'Thêm email' : 'Đổi email'}
          </Button>
        )}
      </InputGroup>
      {placeholder && !open && (
        <Form.Text className="text-muted">
          Thêm email để nhận thông báo đơn hàng và có thể đăng nhập bằng email (dùng "Quên mật khẩu" để đặt mật khẩu).
        </Form.Text>
      )}

      {open && (
        <div className="border rounded-3 p-3 mt-2 bg-white">
          {step === 'email' ? (
            <>
              <Form.Control
                type="email"
                id="new-email"
                className="mb-2"
                placeholder="Email mới"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={noSubmit(() => email && (placeholder || password) && requestCode())}
              />
              {!placeholder && (
                <Form.Control
                  type="password"
                  id="email-current-password"
                  className="mb-2"
                  placeholder="Mật khẩu hiện tại"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={noSubmit(() => email && password && requestCode())}
                />
              )}
              <div className="d-flex gap-2">
                <Button size="sm" disabled={busy || !email.trim() || (!placeholder && !password)} onClick={requestCode}>
                  {busy ? <Spinner size="sm" /> : 'Gửi mã xác nhận'}
                </Button>
                <Button size="sm" variant="outline-secondary" disabled={busy} onClick={reset}>
                  Hủy
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="small mb-2">
                Nhập mã 6 số đã gửi tới <strong>{email.trim().toLowerCase()}</strong>
              </div>
              <Form.Control
                id="email-otp"
                className="mb-2"
                inputMode="numeric"
                maxLength={6}
                placeholder="Mã xác nhận"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={noSubmit(() => code.length === 6 && verify())}
              />
              <div className="d-flex gap-2 flex-wrap">
                <Button size="sm" disabled={busy || code.length !== 6} onClick={verify}>
                  {busy ? <Spinner size="sm" /> : 'Xác nhận'}
                </Button>
                <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setStep('email')}>
                  Đổi email khác / gửi lại mã
                </Button>
                <Button size="sm" variant="link" disabled={busy} onClick={reset}>
                  Hủy
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {msg && (
        <Alert variant={msg.variant} className="small py-2 mt-2 mb-0" dismissible onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}
    </Form.Group>
  );
}
