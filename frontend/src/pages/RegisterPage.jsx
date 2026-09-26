import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert, InputGroup, ButtonGroup, Card } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';
import { authService } from '../services/authService';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { MAX_ADDRESSES, validateName, validatePhone, validatePassword } from '../utils/customerValidation';

const STEP_EMAIL = 1;
const STEP_OTP = 2;
const STEP_INFO = 3;

const LABEL_PRESETS = ['Nhà riêng', 'Công ty'];
const newAddress = (isDefault) => ({ label: 'Nhà riêng', addressLine1: '', addressLine2: '', city: '', isDefault });

// Lỗi của từng ô trong bước "Thông tin" - rỗng nghĩa là hợp lệ
function getErrors(form) {
  const errors = {};
  const nameError = validateName(form.displayName);
  if (nameError) errors.displayName = nameError;
  const phoneError = validatePhone(form.phoneNumber);
  if (phoneError) errors.phoneNumber = phoneError;
  const passwordError = validatePassword(form.password);
  if (passwordError) errors.password = passwordError;
  if (!form.confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu';
  else if (form.confirmPassword !== form.password) errors.confirmPassword = 'Mật khẩu nhập lại không khớp';
  form.addresses.forEach((a, i) => {
    if (!a.addressLine1.trim()) errors[`addr${i}.addressLine1`] = 'Vui lòng nhập số nhà, tên đường';
    if (!a.city.trim()) errors[`addr${i}.city`] = 'Vui lòng nhập tỉnh/thành phố';
  });
  if (!form.acceptTerms) errors.acceptTerms = 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật';
  return errors;
}

export default function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(STEP_EMAIL);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [form, setForm] = useState({
    displayName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    addresses: [],
    acceptTerms: false
  });
  // Ô nào khách đã chạm vào (rời khỏi ô) mới hiện lỗi - tránh báo đỏ cả form ngay khi vừa mở
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const errors = getErrors(form);
  const isValid = Object.keys(errors).length === 0;
  const touch = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const fieldError = (field) => (touched[field] ? errors[field] : undefined);

  const updateAddress = (idx, field, value) =>
    setForm((f) => ({ ...f, addresses: f.addresses.map((a, i) => (i === idx ? { ...a, [field]: value } : a)) }));
  const addAddress = () =>
    setForm((f) => ({ ...f, addresses: [...f.addresses, newAddress(f.addresses.length === 0)] }));
  const removeAddress = (idx) =>
    setForm((f) => {
      const addresses = f.addresses.filter((_, i) => i !== idx);
      if (addresses.length && !addresses.some((a) => a.isDefault)) addresses[0] = { ...addresses[0], isDefault: true };
      return { ...f, addresses };
    });
  const setDefaultAddress = (idx) =>
    setForm((f) => ({ ...f, addresses: f.addresses.map((a, i) => ({ ...a, isDefault: i === idx })) }));
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
    if (!isValid) {
      // Hiện lỗi của mọi ô còn sai để khách thấy cần sửa chỗ nào
      setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
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
        <Form noValidate onSubmit={handleFinishRegister} className="d-flex flex-column gap-3">
          <p className="small text-muted mb-0">
            Các ô có dấu <span className="text-danger">*</span> là bắt buộc
          </p>
          <Form.Group controlId="reg-name">
            <Form.Label className="small fw-medium">
              Họ và tên <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              value={form.displayName}
              placeholder="VD: Nguyễn Văn An"
              autoComplete="name"
              isInvalid={!!fieldError('displayName')}
              onBlur={() => touch('displayName')}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
            <Form.Control.Feedback type="invalid">{fieldError('displayName')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group controlId="reg-phone">
            <Form.Label className="small fw-medium">
              Số điện thoại <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="tel"
              inputMode="tel"
              value={form.phoneNumber}
              placeholder="VD: 0912345678"
              autoComplete="tel"
              isInvalid={!!fieldError('phoneNumber')}
              onBlur={() => touch('phoneNumber')}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            />
            <Form.Control.Feedback type="invalid">{fieldError('phoneNumber')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group controlId="reg-password">
            <Form.Label className="small fw-medium">
              Mật khẩu <span className="text-danger">*</span>
            </Form.Label>
            <InputGroup hasValidation>
              <Form.Control
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                autoComplete="new-password"
                isInvalid={!!fieldError('password')}
                onBlur={() => touch('password')}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <Button variant="outline-secondary" onClick={() => setShowPassword((v) => !v)} aria-label="Hiện/ẩn mật khẩu">
                {showPassword ? 'Ẩn' : 'Hiện'}
              </Button>
              <Form.Control.Feedback type="invalid">{fieldError('password')}</Form.Control.Feedback>
            </InputGroup>
            <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
              Tối thiểu 8 ký tự, gồm cả chữ và số
            </Form.Text>
            <PasswordStrengthMeter password={form.password} />
          </Form.Group>

          <Form.Group controlId="reg-confirm">
            <Form.Label className="small fw-medium">
              Nhập lại mật khẩu <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              autoComplete="new-password"
              isInvalid={!!fieldError('confirmPassword') || (!!form.confirmPassword && form.confirmPassword !== form.password)}
              isValid={!!form.confirmPassword && form.confirmPassword === form.password && !errors.password}
              onBlur={() => touch('confirmPassword')}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            />
            <Form.Control.Feedback type="invalid">{errors.confirmPassword}</Form.Control.Feedback>
          </Form.Group>

          {/* Địa chỉ nhận hàng: không bắt buộc, thêm được nhiều địa chỉ (nhà riêng, công ty...) */}
          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small fw-medium">
                Địa chỉ nhận hàng <span className="text-muted fw-normal">(không bắt buộc)</span>
              </span>
              {form.addresses.length < MAX_ADDRESSES && (
                <Button variant="outline-primary" size="sm" onClick={addAddress}>
                  + Thêm địa chỉ
                </Button>
              )}
            </div>
            {form.addresses.length === 0 && (
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                Lưu sẵn địa chỉ để lần đầu đặt hàng không phải nhập lại. Có thể thêm sau trong mục Sổ địa chỉ.
              </div>
            )}
            <div className="d-flex flex-column gap-2">
              {form.addresses.map((addr, idx) => (
                <Card key={idx} body className={`small ${addr.isDefault ? 'border-dark' : ''}`}>
                  <div className="d-flex justify-content-between align-items-center mb-2 gap-2 flex-wrap">
                    <ButtonGroup size="sm">
                      {LABEL_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          variant={addr.label === preset ? 'dark' : 'outline-secondary'}
                          onClick={() => updateAddress(idx, 'label', preset)}
                        >
                          {preset}
                        </Button>
                      ))}
                    </ButtonGroup>
                    <Button variant="link" size="sm" className="text-danger p-0" onClick={() => removeAddress(idx)}>
                      Xóa
                    </Button>
                  </div>
                  <Form.Control
                    size="sm"
                    className="mb-2"
                    maxLength={30}
                    placeholder="Hoặc tự đặt tên (VD: Nhà bố mẹ)"
                    value={LABEL_PRESETS.includes(addr.label) ? '' : addr.label}
                    onChange={(e) => updateAddress(idx, 'label', e.target.value || 'Nhà riêng')}
                  />
                  <Form.Group className="mb-2">
                    <Form.Control
                      size="sm"
                      placeholder="Số nhà, tên đường *"
                      value={addr.addressLine1}
                      isInvalid={!!fieldError(`addr${idx}.addressLine1`)}
                      onBlur={() => touch(`addr${idx}.addressLine1`)}
                      onChange={(e) => updateAddress(idx, 'addressLine1', e.target.value)}
                    />
                    <Form.Control.Feedback type="invalid">{fieldError(`addr${idx}.addressLine1`)}</Form.Control.Feedback>
                  </Form.Group>
                  <Form.Control
                    size="sm"
                    className="mb-2"
                    placeholder="Phường/Xã, Quận/Huyện"
                    value={addr.addressLine2}
                    onChange={(e) => updateAddress(idx, 'addressLine2', e.target.value)}
                  />
                  <Form.Group className="mb-2">
                    <Form.Control
                      size="sm"
                      placeholder="Tỉnh/Thành phố *"
                      value={addr.city}
                      isInvalid={!!fieldError(`addr${idx}.city`)}
                      onBlur={() => touch(`addr${idx}.city`)}
                      onChange={(e) => updateAddress(idx, 'city', e.target.value)}
                    />
                    <Form.Control.Feedback type="invalid">{fieldError(`addr${idx}.city`)}</Form.Control.Feedback>
                  </Form.Group>
                  <Form.Check
                    type="radio"
                    name="defaultAddress"
                    id={`default-address-${idx}`}
                    label="Địa chỉ mặc định"
                    checked={addr.isDefault}
                    onChange={() => setDefaultAddress(idx)}
                  />
                </Card>
              ))}
            </div>
          </div>

          <Form.Group>
            <Form.Check
              type="checkbox"
              id="acceptTerms"
              className="text-muted"
              style={{ fontSize: '0.75rem' }}
              checked={form.acceptTerms}
              isInvalid={!!fieldError('acceptTerms')}
              onChange={(e) => {
                setForm({ ...form, acceptTerms: e.target.checked });
                touch('acceptTerms');
              }}
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
                  của TechShop <span className="text-danger">*</span>
                </span>
              }
            />
          </Form.Group>
          <Button type="submit" variant="primary" disabled={loading || !isValid} className="w-100 fw-medium py-2">
            {loading ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
          </Button>
          {!isValid && (
            <div className="text-muted text-center" style={{ fontSize: '0.75rem' }}>
              Điền đầy đủ và đúng các ô bắt buộc để hoàn tất đăng ký
            </div>
          )}
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
