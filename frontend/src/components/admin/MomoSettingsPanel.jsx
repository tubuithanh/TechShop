import { useEffect, useState } from 'react';
import { Form, Button, Alert, InputGroup, Spinner, Badge } from 'react-bootstrap';
import { Wallet2, PlugFill, ShieldLockFill, Clipboard } from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';

// Bộ khóa thử CÔNG KHAI trong code mẫu chính thức của MoMo (môi trường test-payment.momo.vn) - chỉ để thử nghiệm
const MOMO_PUBLIC_TEST_KEYS = { momoPartnerCode: 'MOMO', momoAccessKey: 'F8BBA842ECF85', momoSecretKey: 'K951B6PE1waDMi640xX08PD3vg6EkVlz' };

const MODES = [
  { value: 'custom', label: 'Nhập thông tin tại đây', hint: 'Partner Code, Access Key, Secret Key do MoMo cấp (khuyên dùng)' },
  { value: 'env', label: 'Dùng biến môi trường', hint: 'Lấy từ MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY trên máy chủ' },
  { value: 'off', label: 'Tắt thanh toán MoMo', hint: 'Ẩn lựa chọn "Thanh toán qua ví MoMo" ở trang thanh toán' }
];

// Tab "Cấu hình thanh toán MoMo" trong Cấu hình hệ thống: lưu riêng (API /settings/payment/momo), không dùng nút
// Lưu chung của trang. Secret Key không bao giờ được trả về trình duyệt - ô để trống nghĩa là giữ giá trị đã lưu.
export default function MomoSettingsPanel() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(''); // 'save' | 'test'
  const [feedback, setFeedback] = useState(null);

  const load = async () => {
    const data = await settingService.getMomoConfig();
    setSaved(data);
    setForm({
      momoMode: data.momoMode,
      momoPartnerCode: data.momoPartnerCode,
      momoAccessKey: data.momoAccessKey,
      momoSecretKey: '',
      momoEndpoint: data.momoEndpoint,
      momoRedirectUrl: data.momoRedirectUrl,
      momoIpnUrl: data.momoIpnUrl
    });
  };

  useEffect(() => {
    load().catch((err) =>
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không tải được cấu hình MoMo (cần quyền Admin)' })
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
      const res = await settingService.updateMomoConfig(form);
      await load();
      setFeedback({ type: 'success', message: res.message });
    });
  const handleTest = () =>
    run('test', async () => {
      const res = await settingService.testMomoConfig(form);
      setFeedback({ type: 'success', message: res.message });
    });
  const fillTestKeys = () =>
    setForm((f) => ({ ...f, momoMode: 'custom', ...MOMO_PUBLIC_TEST_KEYS, momoEndpoint: '' }));
  const copy = (text) => navigator.clipboard?.writeText(text);

  const { momoMode } = form;
  const active =
    momoMode === 'custom'
      ? saved.momoMode === 'custom' && saved.momoPartnerCode && saved.momoAccessKey && saved.hasSecretKey
      : momoMode === 'env' && saved.envConfigured;
  const ipn = form.momoIpnUrl || saved.defaultIpnUrl;

  // Panel nằm trong form chung của trang Cấu hình: chặn Enter để không vô tình gửi form cấu hình chung
  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && e.preventDefault()}>
      <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <Wallet2 className="text-primary" /> Cấu hình thanh toán MoMo
      </h2>
      <p className="small text-muted">
        Khách thanh toán bằng ví MoMo (quét QR / mở app), thẻ ATM hoặc thẻ quốc tế trên trang của MoMo. Tài liệu và đăng ký tài
        khoản doanh nghiệp tại{' '}
        <a href="https://developers.momo.vn" target="_blank" rel="noreferrer">
          developers.momo.vn
        </a>
        . Áp dụng ngay sau khi lưu. MoMo nhận đơn từ {saved.limits.min.toLocaleString('vi-VN')}đ đến{' '}
        {saved.limits.max.toLocaleString('vi-VN')}đ - đơn ngoài khoảng này khách không chọn được MoMo.
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
        {saved.momoMode === 'off' ? (
          <Badge bg="secondary">Đang tắt</Badge>
        ) : active ? (
          <Badge bg="success">Đang hoạt động</Badge>
        ) : (
          <Badge bg="warning" text="dark">
            Chưa cấu hình - khách chưa thanh toán MoMo được
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
              id={`momo-mode-${m.value}`}
              name="momoMode"
              checked={momoMode === m.value}
              onChange={() => set('momoMode', m.value)}
              label={
                <span className="small">
                  <span className="fw-medium">{m.label}</span> <span className="text-muted">- {m.hint}</span>
                </span>
              }
            />
          ))}
        </div>
      </Form.Group>

      {momoMode === 'env' && (
        <Alert variant={saved.envConfigured ? 'info' : 'warning'} className="small">
          {saved.envConfigured
            ? `Máy chủ đang có biến môi trường MoMo (Partner Code: ${saved.envPartnerCode}).`
            : 'Máy chủ chưa có biến môi trường MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY - hãy chọn "Nhập thông tin tại đây".'}
        </Alert>
      )}

      {momoMode === 'custom' && (
        <>
          <Alert variant="light" className="small border py-2">
            Chưa có tài khoản MoMo? Dùng{' '}
            <Button variant="link" size="sm" className="p-0 align-baseline" onClick={fillTestKeys}>
              bộ khóa thử công khai của MoMo
            </Button>{' '}
            (môi trường thử nghiệm, không trừ tiền thật) để chạy thử.
          </Alert>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Partner Code</Form.Label>
            <Form.Control
              id="momo-partner-code"
              value={form.momoPartnerCode}
              placeholder="VD: MOMOXXXX20240101"
              onChange={(e) => set('momoPartnerCode', e.target.value.trim())}
              autoComplete="off"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Access Key</Form.Label>
            <Form.Control
              id="momo-access-key"
              value={form.momoAccessKey}
              onChange={(e) => set('momoAccessKey', e.target.value.trim())}
              autoComplete="off"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">
              Secret Key{' '}
              {saved.hasSecretKey && (
                <Badge bg="success" className="ms-1">
                  <ShieldLockFill className="me-1" />
                  Đã lưu (mã hóa)
                </Badge>
              )}
            </Form.Label>
            <Form.Control
              id="momo-secret-key"
              type="password"
              value={form.momoSecretKey}
              placeholder={saved.hasSecretKey ? 'Để trống để giữ Secret Key đã lưu' : 'Secret Key MoMo cấp'}
              onChange={(e) => set('momoSecretKey', e.target.value)}
              autoComplete="new-password"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Địa chỉ cổng thanh toán (Endpoint)</Form.Label>
            <Form.Control value={form.momoEndpoint} placeholder={saved.defaultEndpoint} onChange={(e) => set('momoEndpoint', e.target.value.trim())} />
            <Form.Text className="text-muted">
              Để trống = môi trường thử nghiệm. Khi chạy thật dùng <code>https://payment.momo.vn</code> với khóa thật.
            </Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Redirect URL (trang khách quay về sau khi thanh toán)</Form.Label>
            <Form.Control
              value={form.momoRedirectUrl}
              placeholder={saved.defaultRedirectUrl}
              onChange={(e) => set('momoRedirectUrl', e.target.value.trim())}
            />
            <Form.Text className="text-muted">Để trống = {saved.defaultRedirectUrl}</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">IPN URL (tùy chọn)</Form.Label>
            <Form.Control value={form.momoIpnUrl} placeholder={saved.defaultIpnUrl} onChange={(e) => set('momoIpnUrl', e.target.value.trim())} />
            <Form.Text className="text-muted">Để trống = tự dùng địa chỉ máy chủ hiện tại (khuyên dùng).</Form.Text>
          </Form.Group>
        </>
      )}

      {momoMode !== 'off' && (
        <Form.Group className="mb-3">
          <Form.Label className="small fw-medium">IPN URL đang dùng</Form.Label>
          <InputGroup size="sm">
            <Form.Control readOnly value={ipn} />
            <Button variant="outline-secondary" onClick={() => copy(ipn)} title="Sao chép">
              <Clipboard />
            </Button>
          </InputGroup>
          <Form.Text className="text-muted">
            MoMo gọi địa chỉ này để báo kết quả (tự gửi kèm mỗi giao dịch, không cần khai báo trên trang MoMo). Địa chỉ
            localhost MoMo không gọi tới được - khi đó kết quả vẫn được ghi nhận qua trang khách quay về.
          </Form.Text>
        </Form.Group>
      )}

      <div className="d-flex flex-wrap gap-2">
        <Button variant="primary" onClick={handleSave} disabled={!!busy}>
          {busy === 'save' ? 'Đang lưu...' : 'Lưu cấu hình MoMo'}
        </Button>
        {momoMode !== 'off' && (
          <Button variant="outline-primary" onClick={handleTest} disabled={!!busy}>
            <PlugFill className="me-1" />
            {busy === 'test' ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
          </Button>
        )}
      </div>
      <p className="small text-muted mt-2 mb-0">
        "Kiểm tra kết nối" dùng thông tin đang nhập (chưa cần lưu) để tạo thử 1 yêu cầu thanh toán 10.000đ trên MoMo - không trừ
        tiền.
      </p>
    </div>
  );
}
