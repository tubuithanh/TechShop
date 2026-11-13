import { useEffect, useState } from 'react';
import { Card, Form, Button, Alert, Badge, Spinner, Row, Col, Table } from 'react-bootstrap';
import { Truck, CheckCircleFill, BoxArrowUpRight, ShieldLockFill } from 'react-bootstrap-icons';
import api from '../../services/api';

// Admin -> Cấu hình hệ thống -> Đơn vị giao hàng.
// Danh sách đơn vị và các trường cấu hình lấy từ máy chủ (backend/utils/shippingProviders.js) - thêm đơn vị mới
// ở backend là giao diện tự hiện, không cần sửa file này.
export default function ShippingProvidersPanel() {
  const [data, setData] = useState(null); // { config, providers, stores }
  const [mode, setMode] = useState('env');
  const [active, setActive] = useState('simulation');
  const [forms, setForms] = useState({}); // { providerId: { values: {}, shops: {} } }
  const [routingApiUrl, setRoutingApiUrl] = useState('');
  const [msg, setMsg] = useState(null); // { variant, text }
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState({}); // { providerId: { ok, message, shops } }

  const apply = (d) => {
    setData(d);
    setMode(d.config.mode);
    setActive(d.config.activeProvider);
    setRoutingApiUrl(d.config.routingApiUrl || '');
    // Trường bí mật luôn để trống trên form (để trống = giữ giá trị đã lưu)
    setForms(Object.fromEntries(d.providers.map((p) => [p.id, { values: { ...(d.config.providers[p.id]?.values || {}) }, shops: { ...(d.config.providers[p.id]?.shops || {}) } }])));
  };
  const load = () => api.get('/settings/shipping').then((r) => apply(r.data.data)).catch((err) => setMsg({ variant: 'danger', text: err.response?.data?.message || 'Không tải được cấu hình giao hàng' }));
  useEffect(() => { load(); }, []);

  const setValue = (pid, key, v) => setForms((f) => ({ ...f, [pid]: { ...f[pid], values: { ...f[pid].values, [key]: v } } }));
  const setShop = (pid, storeId, v) => setForms((f) => ({ ...f, [pid]: { ...f[pid], shops: { ...f[pid].shops, [storeId]: v } } }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await api.put('/settings/shipping', { mode, activeProvider: active, providers: forms, routingApiUrl });
      setMsg({ variant: 'success', text: `${r.data.message}. Áp dụng ngay, không cần khởi động lại máy chủ.` });
      await load();
    } catch (err) {
      setMsg({ variant: 'danger', text: err.response?.data?.message || 'Không lưu được' });
    } finally { setSaving(false); }
  };

  const test = async (pid) => {
    setTesting(pid);
    setTestResult((t) => ({ ...t, [pid]: null }));
    try {
      const r = await api.post('/settings/shipping/test', { provider: pid, ...forms[pid] });
      setTestResult((t) => ({ ...t, [pid]: r.data.data }));
    } catch (err) {
      setTestResult((t) => ({ ...t, [pid]: { ok: false, message: err.response?.data?.message || 'Kiểm tra thất bại' } }));
    } finally { setTesting(''); }
  };

  if (!data) return msg ? <Alert variant={msg.variant}>{msg.text}</Alert> : <div className="py-4 text-center"><Spinner size="sm" /></div>;
  const { config, providers, stores } = data;
  const current = providers.find((p) => p.id === active);

  return (
    // Không dùng <Form> riêng: panel nằm trong form lớn của trang Cấu hình (form lồng form không hợp lệ).
    // Chặn Enter trong ô nhập để không vô tình gửi form cấu hình chung bên ngoài.
    <div onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }}>
      <h3 className="fs-6 fw-bold mb-1 border-start border-4 border-primary ps-2 d-flex align-items-center gap-2"><Truck /> Đơn vị giao hàng</h3>
      <p className="small text-muted">
        Chọn đơn vị vận chuyển dùng để tạo vận đơn ở trang Phân công giao hàng. Có thể lưu cấu hình nhiều đơn vị và chuyển đổi bất cứ lúc nào.
        Áp dụng ngay sau khi lưu.
      </p>
      {msg && <Alert variant={msg.variant} dismissible onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Form.Label className="fw-medium">Nguồn cấu hình</Form.Label>
      <Form.Check type="radio" id="ship-custom" name="ship-mode" checked={mode === 'custom'} onChange={() => setMode('custom')}
        label={<><span className="fw-medium">Cấu hình tại đây</span> <span className="text-muted small">- chọn đơn vị và nhập thông tin kết nối bên dưới (khuyên dùng)</span></>} />
      <Form.Check type="radio" id="ship-env" name="ship-mode" className="mb-3" checked={mode === 'env'} onChange={() => setMode('env')}
        label={<><span className="fw-medium">Dùng biến môi trường</span> <span className="text-muted small">
          - SHIPPING_PROVIDER / GHN_TOKEN... trên máy chủ (cách cũ). Hiện tại: <code>{config.env.provider}</code>
          {config.env.ghnToken && <>, token <code>{config.env.ghnToken}</code>, {config.env.ghnShops} chi nhánh</>}</span></>} />

      <fieldset disabled={mode !== 'custom'} style={{ opacity: mode === 'custom' ? 1 : 0.55 }}>
        <Form.Label className="fw-medium">Đơn vị đang dùng</Form.Label>
        <Row className="g-2 mb-3">
          {providers.map((p) => (
            <Col key={p.id} md={6}>
              <label className={`d-block border rounded-3 p-3 h-100 ${active === p.id ? 'border-primary border-2 bg-primary-subtle' : ''}`} style={{ cursor: 'pointer' }}>
                <Form.Check type="radio" name="ship-provider" id={`prov-${p.id}`} className="d-inline-block me-1" checked={active === p.id} onChange={() => setActive(p.id)} />
                <span className="fw-semibold">{p.name}</span> {p.badge && <Badge bg="secondary" className="fw-normal ms-1">{p.badge}</Badge>}
                {active === p.id && <CheckCircleFill className="text-primary ms-2" />}
                <div className="small text-muted mt-1">{p.description}</div>
              </label>
            </Col>
          ))}
        </Row>

        {/* Cấu hình riêng của đơn vị đang chọn */}
        {current && (current.fields.length > 0 || current.storeMapping) && (
          <Card className="border mb-3">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                <div className="fw-semibold">Kết nối {current.name}</div>
                <div className="small d-flex gap-3">
                  {current.signupUrl && <a href={current.signupUrl} target="_blank" rel="noopener noreferrer">Đăng ký tài khoản test <BoxArrowUpRight size={10} /></a>}
                  {current.docsUrl && <a href={current.docsUrl} target="_blank" rel="noopener noreferrer">Tài liệu API <BoxArrowUpRight size={10} /></a>}
                </div>
              </div>
              {current.fields.map((f) => {
                const secret = config.providers[current.id]?.secrets?.[f.key];
                return (
                  <Form.Group key={f.key} className="mb-3">
                    <Form.Label className="small fw-medium d-flex align-items-center gap-2">
                      {f.label}{f.required && ' *'}
                      {f.secret && secret?.saved && !secret.unreadable && <Badge bg="success-subtle" text="success-emphasis" className="fw-normal"><ShieldLockFill /> Đã lưu (mã hóa)</Badge>}
                      {f.secret && secret?.unreadable && <Badge bg="danger" className="fw-normal">Không giải mã được - nhập lại</Badge>}
                    </Form.Label>
                    {f.type === 'select' ? (
                      <Form.Select value={forms[current.id]?.values?.[f.key] || ''} onChange={(e) => setValue(current.id, f.key, e.target.value)}>
                        {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Form.Select>
                    ) : (
                      <Form.Control
                        type={f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : 'text'}
                        autoComplete="off"
                        placeholder={f.secret && secret?.saved ? 'Để trống để giữ giá trị đã lưu' : f.placeholder}
                        value={forms[current.id]?.values?.[f.key] || ''}
                        onChange={(e) => setValue(current.id, f.key, e.target.value)}
                      />
                    )}
                    {f.help && <Form.Text className="text-muted">{f.help}</Form.Text>}
                  </Form.Group>
                );
              })}

              {current.storeMapping && (
                <>
                  <Form.Label className="small fw-medium">{current.storeMapping.label} theo chi nhánh</Form.Label>
                  <div className="small text-muted mb-2">{current.storeMapping.help}</div>
                  <Table size="sm" className="mb-2 align-middle">
                    <thead><tr className="small text-muted"><th>Chi nhánh TechShop</th><th style={{ width: 220 }}>{current.storeMapping.label}</th></tr></thead>
                    <tbody>
                      {stores.map((s) => (
                        <tr key={s._id} className={s.isActive ? '' : 'opacity-50'}>
                          <td className="small">{s.name} <span className="text-muted">· {s.city}</span>{!s.isActive && ' (đã ngưng)'}</td>
                          <td>
                            <Form.Control size="sm" inputMode="numeric" placeholder="Để trống = chưa dùng"
                              value={forms[current.id]?.shops?.[s._id] || ''} onChange={(e) => setShop(current.id, s._id, e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}

              {current.testable && (
                <div className="d-flex align-items-start gap-2 flex-wrap">
                  <Button type="button" variant="outline-primary" size="sm" disabled={testing === current.id} onClick={() => test(current.id)}>
                    {testing === current.id ? <><Spinner size="sm" /> Đang kiểm tra...</> : 'Kiểm tra kết nối'}
                  </Button>
                  {testResult[current.id] && (
                    <Alert variant={testResult[current.id].ok ? 'success' : 'warning'} className="small py-1 px-2 mb-0 flex-grow-1">
                      {testResult[current.id].message}
                      {testResult[current.id].shops?.length > 0 && (
                        <div className="mt-1">Cửa hàng trên tài khoản: {testResult[current.id].shops.map((s) => `${s.id} (${s.name}${s.active ? '' : ', chưa hoạt động'})`).join(' · ')}</div>
                      )}
                    </Alert>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        )}

        <Form.Group className="mb-3">
          <Form.Label className="small fw-medium">Dịch vụ tính quãng đường (OSRM)</Form.Label>
          <Form.Control type="url" placeholder={config.defaultRoutingApiUrl} value={routingApiUrl} onChange={(e) => setRoutingApiUrl(e.target.value)} />
          <Form.Text className="text-muted">Dùng để tính khoảng cách từ chi nhánh tới khách (chọn giao nội bộ hay giao qua đơn vị vận chuyển). Để trống = máy chủ demo công khai.</Form.Text>
        </Form.Group>
      </fieldset>

      <div className="d-flex align-items-center gap-3">
        <Button type="button" disabled={saving} onClick={save}>{saving ? 'Đang lưu...' : 'Lưu cấu hình giao hàng'}</Button>
        {config.updatedAt && <span className="small text-muted">Cập nhật lần cuối {new Date(config.updatedAt).toLocaleString('vi-VN')}</span>}
      </div>
    </div>
  );
}
