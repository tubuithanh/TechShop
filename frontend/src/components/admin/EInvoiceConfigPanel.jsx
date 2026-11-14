import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { FileEarmarkText, CheckCircleFill, ShieldLockFill, PlugFill, BoxArrowUpRight } from 'react-bootstrap-icons';
import api from '../../services/api';

const SELLER = [['companyName', 'Tên đơn vị bán hàng', 12, 'VD: CÔNG TY TNHH TECHSHOP VIỆT NAM'], ['taxCode', 'Mã số thuế', 4, '0109999999'], ['phone', 'Điện thoại', 4, ''], ['email', 'Email', 4, ''], ['address', 'Địa chỉ', 8, ''], ['bankAccount', 'Số tài khoản ngân hàng', 4, '']];

// Admin -> Cấu hình hệ thống -> Hóa đơn điện tử. Danh sách nhà cung cấp + trường cấu hình lấy từ máy chủ
// (backend/utils/einvoiceProviders.js) - thêm nhà cung cấp mới ở backend là giao diện tự hiện.
export default function EInvoiceConfigPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [test, setTest] = useState({});

  const apply = (d) => {
    setData(d);
    setForm({
      activeProvider: d.config.activeProvider, seller: { ...d.config.seller }, template: d.config.template, series: d.config.series,
      autoIssue: d.config.autoIssue, autoEmail: d.config.autoEmail,
      providers: Object.fromEntries(d.providers.map((p) => [p.id, { values: Object.fromEntries(p.fields.map((f) => [f.key, f.secret ? '' : (d.config.providers[p.id]?.values?.[f.key] ?? f.default ?? '')])) }]))
    });
  };
  useEffect(() => { api.get('/settings/einvoice').then((r) => apply(r.data.data)).catch((e) => setMsg({ variant: 'danger', text: e.response?.data?.message || 'Không tải được cấu hình' })); }, []);

  const setVal = (pid, key, v) => setForm((f) => ({ ...f, providers: { ...f.providers, [pid]: { values: { ...f.providers[pid].values, [key]: v } } } }));
  const save = async () => {
    setSaving(true); setMsg(null);
    try { const r = await api.put('/settings/einvoice', form); apply(r.data.data); setMsg({ variant: 'success', text: r.data.message }); }
    catch (e) { setMsg({ variant: 'danger', text: e.response?.data?.message || 'Lưu thất bại' }); } finally { setSaving(false); }
  };
  const runTest = async (pid) => {
    setTesting(pid);
    try { const r = await api.post('/settings/einvoice/test', { provider: pid, values: form.providers[pid].values }); setTest((t) => ({ ...t, [pid]: r.data.data })); }
    catch (e) { setTest((t) => ({ ...t, [pid]: { ok: false, message: e.response?.data?.message || 'Kiểm tra thất bại' } })); } finally { setTesting(''); }
  };

  if (!form) return msg ? <Alert variant={msg.variant}>{msg.text}</Alert> : <Spinner size="sm" />;
  const year = String(new Date().getFullYear()).slice(-2);
  return (
    <div>
      <h2 className="fs-5 fw-semibold mb-1"><FileEarmarkText className="me-2" />Hóa đơn điện tử</h2>
      <p className="small text-muted">Chọn nhà cung cấp phát hành hóa đơn. Mặc định là <b>giả lập</b> (không gửi cơ quan thuế). Thêm nhà cung cấp mới: khai báo trong <code>backend/utils/einvoiceProviders.js</code>.</p>
      {msg && <Alert variant={msg.variant} dismissible onClose={() => setMsg(null)} className="py-2">{msg.text}</Alert>}

      {/* Nhà cung cấp */}
      <div className="fw-semibold mb-2">1. Nhà cung cấp hóa đơn</div>
      <Row xs={1} md={2} className="g-3 mb-4">
        {data.providers.map((p) => {
          const on = form.activeProvider === p.id;
          const t = test[p.id];
          return (
            <Col key={p.id}>
              <Card className={`h-100 ${on ? 'border-primary border-2' : ''}`}>
                <Card.Body>
                  <Form.Check type="radio" name="einv-provider" id={`einv-${p.id}`} checked={on} onChange={() => setForm({ ...form, activeProvider: p.id })}
                    label={<span className="fw-semibold">{p.name} {p.badge && <Badge bg={p.id === 'simulation' ? 'secondary' : 'info'} className="fw-normal">{p.badge}</Badge>} {on && <Badge bg="success" className="fw-normal"><CheckCircleFill className="me-1" />Đang dùng</Badge>}</span>} />
                  <div className="small text-muted mt-1">{p.description}</div>
                  {p.docs && <a href={p.docs} target="_blank" rel="noreferrer" className="small"><BoxArrowUpRight className="me-1" />Trang nhà cung cấp</a>}
                  {p.fields.length > 0 && (
                    <Row className="g-2 mt-2">
                      {p.fields.map((f) => (
                        <Col md={f.key === 'apiUrl' ? 12 : 6} key={f.key}>
                          <Form.Label className="small mb-0">{f.label}{f.required && ' *'} {f.secret && <ShieldLockFill className="text-success" title="Lưu mã hóa" />}</Form.Label>
                          <Form.Control size="sm" type={f.type === 'password' ? 'password' : 'text'} autoComplete="off" value={form.providers[p.id].values[f.key] || ''}
                            placeholder={f.secret && data.config.providers[p.id]?.secretsSet?.[f.key] ? '•••••• (đã lưu - để trống = giữ nguyên)' : f.placeholder || ''}
                            onChange={(e) => setVal(p.id, f.key, e.target.value)} />
                          {f.help && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{f.help}</div>}
                        </Col>
                      ))}
                    </Row>
                  )}
                  <div className="d-flex align-items-center gap-2 mt-2">
                    <Button size="sm" variant="outline-primary" disabled={testing === p.id} onClick={() => runTest(p.id)}><PlugFill className="me-1" />{testing === p.id ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</Button>
                    {t && <span className={`small ${t.ok ? 'text-success' : 'text-danger'}`}>{t.ok ? '✓' : '✗'} {t.message}</span>}
                  </div>
                  {p.id === 'bkav' && <div className="small text-warning-emphasis bg-warning-subtle rounded p-2 mt-2">Bộ kết nối Bkav viết theo tài liệu tích hợp (ExecCommand, GZip + AES). Cần tài khoản demo Bkav để kiểm chứng trước khi dùng thật. Khi Bkav lỗi, hóa đơn KHÔNG được tạo (không tự chuyển sang giả lập).</div>}
                </Card.Body>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Người bán */}
      <div className="fw-semibold mb-2">2. Thông tin người bán trên hóa đơn</div>
      <Row className="g-2 mb-4">
        {SELLER.map(([k, label, md, ph]) => (
          <Col md={md} key={k}><Form.Label className="small mb-0">{label}</Form.Label><Form.Control size="sm" value={form.seller[k] || ''} placeholder={ph} onChange={(e) => setForm({ ...form, seller: { ...form.seller, [k]: e.target.value } })} /></Col>
        ))}
        <Col md={12}><div className="small text-muted">Để trống = dùng thông tin giả lập mặc định (tên website, MST 0109999999).</div></Col>
      </Row>

      {/* Ký hiệu + tự động */}
      <div className="fw-semibold mb-2">3. Ký hiệu & tự động hóa</div>
      <Row className="g-2 mb-3 align-items-end">
        <Col md={2}><Form.Label className="small mb-0">Mẫu số</Form.Label><Form.Control size="sm" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} /></Col>
        <Col md={3}><Form.Label className="small mb-0">Ký hiệu</Form.Label><Form.Control size="sm" className="text-uppercase" maxLength={6} placeholder={`C${year}TTS (mặc định)`} value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value.toUpperCase() })} /></Col>
        <Col md={7}><div className="small text-muted">Dạng <b>C{year}TAA</b>: C = có mã CQT (K = không mã) · {year} = năm · T = DN đăng ký · AA = do DN tự đặt.</div></Col>
      </Row>
      <Form.Check type="switch" id="einv-auto" className="mb-1" checked={form.autoIssue} onChange={(e) => setForm({ ...form, autoIssue: e.target.checked })} label={<span><b>Tự xuất hóa đơn</b> khi đơn giao thành công / bán tại quầy (đơn đã thu tiền)</span>} />
      <Form.Check type="switch" id="einv-mail" className="mb-3" checked={form.autoEmail} onChange={(e) => setForm({ ...form, autoEmail: e.target.checked })} label={<span><b>Tự gửi email</b> hóa đơn cho người mua có email</span>} />

      <Button disabled={saving} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu cấu hình hóa đơn điện tử'}</Button>
      {data.config.updatedAt && <span className="small text-muted ms-2">Cập nhật lần cuối {new Date(data.config.updatedAt).toLocaleString('vi-VN')}</span>}
    </div>
  );
}
