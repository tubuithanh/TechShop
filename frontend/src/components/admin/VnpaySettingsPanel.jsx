import { useEffect, useState } from 'react';
import { Form, Button, Alert, InputGroup, Spinner, Badge } from 'react-bootstrap';
import { CreditCard2FrontFill, PlugFill, ShieldLockFill, Clipboard } from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';

const MODES = [
  { value: 'custom', label: 'Nhập thông tin tại đây', hint: 'Terminal ID và Secret Key do VNPay cấp (khuyên dùng)' },
  { value: 'env', label: 'Dùng biến môi trường', hint: 'Lấy từ VNP_TMN_CODE / VNP_HASH_SECRET trên máy chủ (cách cấu hình cũ)' },
  { value: 'off', label: 'Tắt thanh toán VNPay', hint: 'Ẩn lựa chọn "Thanh toán qua VNPay" ở trang thanh toán' }
];

// Tab "Cấu hình thanh toán VNPay" trong Cấu hình hệ thống: lưu riêng (API /settings/payment), không dùng nút Lưu
// chung của trang. Secret Key không bao giờ được trả về trình duyệt - ô để trống nghĩa là giữ giá trị đã lưu.
export default function VnpaySettingsPanel() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(''); // 'save' | 'test'
  const [feedback, setFeedback] = useState(null);

  const load = async () => {
    const data = await settingService.getPaymentConfig();
    setSaved(data);
    setForm({
      vnpayMode: data.vnpayMode,
      vnpTmnCode: data.vnpTmnCode,
      vnpHashSecret: '',
      vnpUrl: data.vnpUrl,
      vnpReturnUrl: data.vnpReturnUrl
    });
  };

  useEffect(() => {
    load().catch((err) =>
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không tải được cấu hình VNPay (cần quyền Admin)' })
    );
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
      const res = await settingService.updatePaymentConfig(form);
      await load();
      setFeedback({ type: 'success', message: res.message });
    });
  const handleTest = () =>
    run('test', async () => {
      const res = await settingService.testPaymentConfig(form);
      setFeedback({ type: 'success', message: res.message });
    });
  const copy = (text) => navigator.clipboard?.writeText(text);

  const { vnpayMode } = form;
  const active =
    vnpayMode === 'custom'
      ? saved.vnpayMode === 'custom' && saved.vnpTmnCode && saved.hasHashSecret
      : vnpayMode === 'env' && saved.envConfigured;

  // Panel nằm trong form chung của trang Cấu hình: chặn Enter để không vô tình gửi form cấu hình chung
  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && e.preventDefault()}>
      <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <CreditCard2FrontFill className="text-primary" /> Cấu hình thanh toán VNPay
      </h2>
      <p className="small text-muted">
        Thông tin tài khoản merchant VNPay để khách thanh toán online. Đăng ký tài khoản thử nghiệm (sandbox) miễn phí tại{' '}
        <a href="https://sandbox.vnpayment.vn/devreg" target="_blank" rel="noreferrer">
          sandbox.vnpayment.vn/devreg
        </a>
        . Áp dụng ngay sau khi lưu, không cần khởi động lại máy chủ.
      </p>

      {feedback && (
        <Alert variant={feedback.type} onClose={() => setFeedback(null)} dismissible className="small">
          {feedback.message}
        </Alert>
      )}
      {saved.secretUnreadable && (
        <Alert variant="warning" className="small">
          Secret Key đã lưu không còn giải mã được (khóa mã hóa trên máy chủ đã thay đổi). Vui lòng nhập lại rồi lưu.
        </Alert>
      )}

      <div className="mb-3 small">
        Trạng thái:{' '}
        {saved.vnpayMode === 'off' ? (
          <Badge bg="secondary">Đang tắt</Badge>
        ) : active ? (
          <Badge bg="success">Đang hoạt động</Badge>
        ) : (
          <Badge bg="warning" text="dark">
            Chưa cấu hình - khách chưa thanh toán VNPay được
          </Badge>
        )}
      </div>

      <Form.Group className="mb-3">
        <Form.Label className="small fw-medium">Nguồn cấu hình</Form.Label>
        <div className="d-flex flex-column gap-2">
          {MODES.map((m) => (
            <Form.Check
              key={m.value}
              type="radio"
              id={`vnpay-mode-${m.value}`}
              name="vnpayMode"
              checked={vnpayMode === m.value}
              onChange={() => set('vnpayMode', m.value)}
              label={
                <span className="small">
                  <span className="fw-medium">{m.label}</span> <span className="text-muted">- {m.hint}</span>
                </span>
              }
            />
          ))}
        </div>
      </Form.Group>

      {vnpayMode === 'env' && (
        <Alert variant={saved.envConfigured ? 'info' : 'warning'} className="small">
          {saved.envConfigured
            ? `Máy chủ đang có biến môi trường VNP_TMN_CODE (${saved.envTmnCode}) và VNP_HASH_SECRET.`
            : 'Máy chủ chưa có biến môi trường VNP_TMN_CODE / VNP_HASH_SECRET - hãy chọn "Nhập thông tin tại đây".'}
        </Alert>
      )}

      {vnpayMode === 'custom' && (
        <>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Terminal ID (vnp_TmnCode)</Form.Label>
            <Form.Control
              value={form.vnpTmnCode}
              placeholder="VD: 2QXUI4J4"
              onChange={(e) => set('vnpTmnCode', e.target.value.trim())}
              autoComplete="off"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">
              Secret Key (vnp_HashSecret){' '}
              {saved.hasHashSecret && (
                <Badge bg="success" className="ms-1">
                  <ShieldLockFill className="me-1" />
                  Đã lưu (mã hóa)
                </Badge>
              )}
            </Form.Label>
            <Form.Control
              type="password"
              value={form.vnpHashSecret}
              placeholder={saved.hasHashSecret ? 'Để trống để giữ Secret Key đã lưu' : 'Secret Key VNPay gửi qua email'}
              onChange={(e) => set('vnpHashSecret', e.target.value)}
              autoComplete="new-password"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Địa chỉ cổng thanh toán (vnp_Url)</Form.Label>
            <Form.Control
              value={form.vnpUrl}
              placeholder={saved.defaultUrl}
              onChange={(e) => set('vnpUrl', e.target.value.trim())}
            />
            <Form.Text className="text-muted">
              Để trống = môi trường thử nghiệm (sandbox). Khi chạy thật, dùng địa chỉ VNPay cung cấp trong hợp đồng.
            </Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Return URL (trang khách quay về sau khi thanh toán)</Form.Label>
            <Form.Control
              value={form.vnpReturnUrl}
              placeholder={saved.defaultReturnUrl}
              onChange={(e) => set('vnpReturnUrl', e.target.value.trim())}
            />
            <Form.Text className="text-muted">Để trống = {saved.defaultReturnUrl}</Form.Text>
          </Form.Group>
        </>
      )}

      {vnpayMode !== 'off' && (
        <Form.Group className="mb-3">
          <Form.Label className="small fw-medium">IPN URL (khai báo trong trang quản lý merchant của VNPay)</Form.Label>
          <InputGroup size="sm">
            <Form.Control readOnly value={saved.ipnUrl} />
            <Button variant="outline-secondary" onClick={() => copy(saved.ipnUrl)} title="Sao chép">
              <Clipboard />
            </Button>
          </InputGroup>
          <Form.Text className="text-muted">
            VNPay gọi địa chỉ này để báo kết quả thanh toán, đơn hàng sẽ tự chuyển sang "Đã thanh toán".
          </Form.Text>
        </Form.Group>
      )}

      <div className="d-flex flex-wrap gap-2">
        <Button variant="primary" onClick={handleSave} disabled={!!busy}>
          {busy === 'save' ? 'Đang lưu...' : 'Lưu cấu hình VNPay'}
        </Button>
        {vnpayMode !== 'off' && (
          <Button variant="outline-primary" onClick={handleTest} disabled={!!busy}>
            <PlugFill className="me-1" />
            {busy === 'test' ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
          </Button>
        )}
      </div>
      <p className="small text-muted mt-2 mb-0">
        "Kiểm tra kết nối" dùng thông tin đang nhập (chưa cần lưu) để mở thử 1 link thanh toán 10.000đ trên VNPay - không
        tạo giao dịch thật.
      </p>
    </div>
  );
}
