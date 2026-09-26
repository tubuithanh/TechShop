import { useEffect, useState } from 'react';
import { Row, Col, Form, Button, Alert, InputGroup, Spinner, Badge } from 'react-bootstrap';
import { EnvelopeFill, SendFill, ShieldLockFill } from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';
import { useAuth } from '../../store/AuthContext';

const PROVIDERS = [
  { value: 'env', label: 'Dùng biến môi trường', hint: 'Lấy từ SMTP_* / RESEND_API_KEY trên máy chủ (cách cấu hình cũ)' },
  { value: 'smtp', label: 'SMTP', hint: 'Gmail, Outlook, Brevo, máy chủ mail riêng...' },
  { value: 'resend', label: 'Resend', hint: 'Gửi qua HTTPS - dùng khi máy chủ web chặn cổng SMTP' },
  { value: 'off', label: 'Tắt (demo)', hint: 'Không gửi email; mã OTP hiện ngay trên màn hình đăng ký' }
];
const SMTP_PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587 },
  { label: 'Outlook', host: 'smtp-mail.outlook.com', port: 587 },
  { label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587 }
];
const ENV_MODE_LABEL = { smtp: 'SMTP', resend: 'Resend', demo: 'chưa cấu hình (demo)' };

// Tab "Email" trong Cấu hình hệ thống: lưu riêng (API /settings/mail), không dùng nút Lưu chung của trang.
// Mật khẩu/API key không bao giờ được trả về trình duyệt - ô để trống nghĩa là giữ giá trị đã lưu.
export default function MailSettingsPanel() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [testTo, setTestTo] = useState(user?.email || '');
  const [busy, setBusy] = useState(''); // 'save' | 'test'
  const [feedback, setFeedback] = useState(null);

  const load = async () => {
    const data = await settingService.getMailConfig();
    setSaved(data);
    setForm({ provider: data.provider, smtpHost: data.smtpHost, smtpPort: data.smtpPort, smtpUser: data.smtpUser, smtpPassword: '', resendApiKey: '', from: data.from });
  };
  useEffect(() => {
    load().catch((err) => setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không tải được cấu hình email (cần quyền Admin)' }));
  }, []);

  if (!form) {
    return feedback ? (
      <Alert variant={feedback.type}>{feedback.message}</Alert>
    ) : (
      <div className="text-center py-4">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const run = async (kind, fn) => {
    setBusy(kind);
    setFeedback(null);
    try {
      await fn();
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại' });
    } finally {
      setBusy('');
    }
  };
  const handleSave = () =>
    run('save', async () => {
      const res = await settingService.updateMailConfig(form);
      await load();
      setFeedback({ type: 'success', message: res.message || 'Đã lưu cấu hình email' });
    });
  const handleTest = () =>
    run('test', async () => {
      const res = await settingService.testMailConfig({ ...form, to: testTo });
      setFeedback({ type: 'success', message: res.message });
    });

  const { provider } = form;
  // Panel nằm trong form chung của trang Cấu hình: chặn Enter để không vô tình gửi form cấu hình chung
  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && e.preventDefault()}>
      <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <EnvelopeFill className="text-primary" /> Cấu hình gửi email
      </h2>
      <p className="small text-muted">
        Dùng để gửi mã OTP khi khách đăng ký tài khoản. Cấu hình ở đây được ưu tiên hơn biến môi trường trên máy chủ, và áp
        dụng ngay sau khi lưu (không cần khởi động lại).
      </p>

      {feedback && (
        <Alert variant={feedback.type} onClose={() => setFeedback(null)} dismissible className="small">
          {feedback.message}
        </Alert>
      )}
      {saved.secretUnreadable && (
        <Alert variant="warning" className="small">
          Mật khẩu/API key đã lưu không còn giải mã được (khóa mã hóa trên máy chủ đã thay đổi). Vui lòng nhập lại rồi lưu.
        </Alert>
      )}

      <Form.Group className="mb-3">
        <Form.Label className="small fw-medium">Cách gửi email</Form.Label>
        <div className="d-flex flex-column gap-2">
          {PROVIDERS.map((p) => (
            <Form.Check
              key={p.value}
              type="radio"
              id={`mail-provider-${p.value}`}
              name="mailProvider"
              checked={provider === p.value}
              onChange={() => set('provider', p.value)}
              label={
                <span>
                  <strong>{p.label}</strong>
                  {p.value === 'env' && (
                    <Badge bg="light" text="dark" className="border ms-2 fw-normal">
                      hiện tại: {ENV_MODE_LABEL[saved.envMode]}
                    </Badge>
                  )}
                  <span className="d-block text-muted small">{p.hint}</span>
                </span>
              }
            />
          ))}
        </div>
      </Form.Group>

      {provider === 'smtp' && (
        <>
          <div className="d-flex flex-wrap gap-2 mb-2 small align-items-center">
            <span className="text-muted">Điền nhanh:</span>
            {SMTP_PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="outline-secondary" onClick={() => setForm((f) => ({ ...f, smtpHost: p.host, smtpPort: p.port }))}>
                {p.label}
              </Button>
            ))}
          </div>
          <Row className="g-2 mb-2">
            <Col sm={8}>
              <Form.Group controlId="smtp-host">
                <Form.Label className="small fw-medium">Máy chủ SMTP</Form.Label>
                <Form.Control value={form.smtpHost} placeholder="smtp.gmail.com" onChange={(e) => set('smtpHost', e.target.value)} />
              </Form.Group>
            </Col>
            <Col sm={4}>
              <Form.Group controlId="smtp-port">
                <Form.Label className="small fw-medium">Cổng</Form.Label>
                <Form.Select value={form.smtpPort} onChange={(e) => set('smtpPort', Number(e.target.value))}>
                  <option value={587}>587 (STARTTLS - khuyên dùng)</option>
                  <option value={465}>465 (SSL)</option>
                  <option value={25}>25</option>
                  <option value={2525}>2525</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="smtp-user">
                <Form.Label className="small fw-medium">Tài khoản</Form.Label>
                <Form.Control value={form.smtpUser} placeholder="tenban@gmail.com" autoComplete="off" onChange={(e) => set('smtpUser', e.target.value)} />
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group controlId="smtp-password">
                <Form.Label className="small fw-medium">
                  Mật khẩu {saved.hasSmtpPassword && <Badge bg="success" className="fw-normal ms-1">đã lưu</Badge>}
                </Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="new-password"
                  value={form.smtpPassword}
                  placeholder={saved.hasSmtpPassword ? 'Để trống = giữ mật khẩu đã lưu' : 'Mật khẩu ứng dụng'}
                  onChange={(e) => set('smtpPassword', e.target.value)}
                />
              </Form.Group>
            </Col>
          </Row>
          <Alert variant="info" className="small py-2">
            <strong>Gmail:</strong> bật Xác minh 2 bước rồi tạo <em>Mật khẩu ứng dụng</em> (16 ký tự) tại{' '}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
              myaccount.google.com/apppasswords
            </a>
            . Không dùng mật khẩu đăng nhập Gmail. Người gửi phải là chính địa chỉ Gmail đó.
          </Alert>
        </>
      )}

      {provider === 'resend' && (
        <Form.Group controlId="resend-key" className="mb-2">
          <Form.Label className="small fw-medium">
            API key Resend {saved.hasResendApiKey && <Badge bg="success" className="fw-normal ms-1">đã lưu</Badge>}
          </Form.Label>
          <Form.Control
            type="password"
            autoComplete="new-password"
            value={form.resendApiKey}
            placeholder={saved.hasResendApiKey ? 'Để trống = giữ key đã lưu' : 're_xxxxxxxx'}
            onChange={(e) => set('resendApiKey', e.target.value)}
          />
          <Form.Text className="text-muted">
            Tạo key tại{' '}
            <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">
              resend.com
            </a>
            . Chưa xác minh tên miền thì dùng người gửi <code>onboarding@resend.dev</code> (chỉ gửi được tới email đăng ký Resend).
          </Form.Text>
        </Form.Group>
      )}

      {(provider === 'smtp' || provider === 'resend') && (
        <Form.Group controlId="mail-from" className="mb-3">
          <Form.Label className="small fw-medium">Người gửi (hiển thị trong email)</Form.Label>
          <Form.Control value={form.from} placeholder="TechShop <tenban@gmail.com>" onChange={(e) => set('from', e.target.value)} />
        </Form.Group>
      )}

      <div className="border rounded-3 p-3 bg-body-tertiary mb-3">
        <div className="small fw-medium mb-2">Gửi thử với cấu hình đang nhập (chưa cần lưu)</div>
        <InputGroup>
          <Form.Control type="email" value={testTo} placeholder="Email nhận thử" aria-label="Email nhận thử" onChange={(e) => setTestTo(e.target.value)} />
          <Button variant="outline-primary" onClick={handleTest} disabled={!!busy || provider === 'off' || !testTo}>
            {busy === 'test' ? <Spinner animation="border" size="sm" /> : <><SendFill className="me-1" /> Gửi thử</>}
          </Button>
        </InputGroup>
      </div>

      <div className="d-flex align-items-center gap-3 flex-wrap">
        <Button variant="primary" onClick={handleSave} disabled={!!busy}>
          {busy === 'save' ? 'Đang lưu...' : 'Lưu cấu hình email'}
        </Button>
        <span className="small text-muted d-flex align-items-center gap-1">
          <ShieldLockFill /> Mật khẩu và API key được mã hóa khi lưu, không hiển thị lại
          {saved.encryptionKey === 'JWT_ACCESS_SECRET' && ' (nên đặt biến SETTINGS_SECRET riêng trên máy chủ)'}
        </span>
      </div>
      {saved.updatedAt && <div className="small text-muted mt-2">Cập nhật lần cuối: {new Date(saved.updatedAt).toLocaleString('vi-VN')}</div>}
    </div>
  );
}
