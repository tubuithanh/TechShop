import { useEffect, useState } from 'react';
import { Row, Col, Form, Button, Alert, InputGroup, Spinner, Badge, Card } from 'react-bootstrap';
import { PaletteFill, CheckCircleFill, Trash, Save, ArrowRepeat, CartFill } from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';
import { DEFAULT_THEME, THEME_FIELDS, EFFECTS, normalizeTheme } from '../../utils/theme';
import SeasonalEffect from '../SeasonalEffect';

const KEYS = [...THEME_FIELDS.map((f) => f.key), 'effect'];
const sameTheme = (a, b) => KEYS.every((k) => (a?.[k] || '').toLowerCase() === (b?.[k] || '').toLowerCase());
const pickTheme = (t) => Object.fromEntries(KEYS.map((k) => [k, t[k]]));

// Dải màu nhỏ đại diện cho 1 bộ màu
function Swatches({ theme }) {
  return (
    <div className="d-flex rounded overflow-hidden border" style={{ height: 28 }}>
      {['headerBg', 'primary', 'accent', 'bodyBg', 'footerBg'].map((k) => (
        <div key={k} style={{ flex: 1, background: theme[k] }} title={k} />
      ))}
    </div>
  );
}

// Khung xem trước thu nhỏ: header, nút, giá, nhãn, footer theo bộ màu đang chỉnh
function Preview({ theme }) {
  const t = normalizeTheme(theme);
  return (
    <div className="border rounded-3 overflow-hidden small position-relative" style={{ background: t.bodyBg }}>
      <SeasonalEffect effect={t.effect} count={10} contained />
      <div className="d-flex align-items-center justify-content-between px-3 py-2" style={{ background: t.headerBg, color: t.headerText }}>
        <span className="fw-bold">TechShop</span>
        <span className="d-flex gap-3 align-items-center">
          <span>Khuyến mãi</span>
          <span className="position-relative">
            <CartFill />
            <span
              className="position-absolute top-0 start-100 translate-middle rounded-pill px-1"
              style={{ background: t.accent, color: '#212529', fontSize: 10 }}
            >
              2
            </span>
          </span>
        </span>
      </div>
      <div className="p-3">
        <div className="bg-white rounded-3 p-3 shadow-sm">
          <div className="fw-medium mb-1">iPhone 16 Pro Max 256GB</div>
          <div className="fw-bold mb-2" style={{ color: t.primary }}>
            31.990.000đ
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <span className="btn btn-sm" style={{ background: t.primary, color: '#fff', borderColor: t.primary }}>
              Mua ngay
            </span>
            <span className="btn btn-sm" style={{ color: t.primary, borderColor: t.primary }}>
              Thêm vào giỏ
            </span>
            <span className="btn btn-sm" style={{ background: t.primaryHover, color: '#fff', borderColor: t.primaryHover }}>
              Khi rê chuột
            </span>
          </div>
          <div className="mt-2" style={{ color: t.primary, textDecoration: 'underline' }}>
            Xem chi tiết sản phẩm
          </div>
        </div>
      </div>
      <div className="px-3 py-2" style={{ background: t.footerBg, color: t.footerText }}>
        © TechShop - Hotline 1900 0000
      </div>
    </div>
  );
}

// Tab "Màu sắc giao diện" trong Cấu hình hệ thống. Bộ màu đang chỉnh nằm trong form chung của trang
// (lưu bằng nút "Lưu cấu hình"); template được lưu/xóa riêng qua API /settings/themes.
export default function ThemeSettingsPanel({ theme, savedTheme, onChange }) {
  const current = normalizeTheme(theme);
  const [templates, setTemplates] = useState(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState(null);

  const load = () => settingService.getThemeTemplates().then(setTemplates);
  useEffect(() => {
    load().catch((err) =>
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không tải được danh sách template' })
    );
  }, []);

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

  const setColor = (key, value) => onChange({ ...current, [key]: value });

  const saveAsTemplate = () =>
    run('create', async () => {
      const res = await settingService.createThemeTemplate({ name: newName, theme: pickTheme(current) });
      setNewName('');
      await load();
      setFeedback({ type: 'success', message: res.message });
    });
  const overwriteTemplate = (t) =>
    run(`update-${t._id}`, async () => {
      if (!confirm(`Ghi đè template "${t.name}" bằng bộ màu đang chỉnh?`)) return;
      const res = await settingService.updateThemeTemplate(t._id, { theme: pickTheme(current) });
      await load();
      setFeedback({ type: 'success', message: res.message });
    });
  const removeTemplate = (t) =>
    run(`delete-${t._id}`, async () => {
      if (!confirm(`Xóa template "${t.name}"?`)) return;
      const res = await settingService.deleteThemeTemplate(t._id);
      await load();
      setFeedback({ type: 'success', message: res.message });
    });

  const unsaved = !sameTheme(current, normalizeTheme(savedTheme));

  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && e.preventDefault()}>
      <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <PaletteFill className="text-primary" /> Màu sắc giao diện
      </h2>
      <p className="small text-muted">
        Chọn một template hoặc tự chỉnh từng màu, xem trước bên dưới rồi bấm <strong>Lưu cấu hình</strong> để áp dụng cho
        toàn bộ website. Có thể lưu bộ màu đang chỉnh thành template để dùng lại cho các dịp khác.
      </p>

      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)} className="small py-2">
          {feedback.message}
        </Alert>
      )}
      {unsaved && (
        <Alert variant="warning" className="small py-2">
          Bộ màu đang chỉnh chưa được áp dụng - bấm <strong>Lưu cấu hình</strong> ở cuối trang.
        </Alert>
      )}

      <div className="fw-medium small mb-2">Template</div>
      {!templates ? (
        <div className="text-center py-3">
          <Spinner size="sm" />
        </div>
      ) : (
        <Row xs={1} sm={2} xl={3} className="g-2 mb-4">
          {templates.map((t) => {
            const selected = sameTheme(current, t.theme);
            const inUse = sameTheme(normalizeTheme(savedTheme), t.theme);
            return (
              <Col key={t._id}>
                <Card
                  className={`h-100 ${selected ? 'border-primary border-2' : ''}`}
                  role="button"
                  data-template={t.builtInKey || t.name}
                  onClick={() => onChange(normalizeTheme(t.theme))}
                >
                  <Card.Body className="p-2 d-flex flex-column gap-2">
                    <Swatches theme={t.theme} />
                    <div className="d-flex justify-content-between align-items-start gap-1">
                      <div className="small">
                        <div className="fw-medium d-flex align-items-center gap-1">
                          {selected && <CheckCircleFill className="text-primary flex-shrink-0" />}
                          {t.name}
                        </div>
                        {t.description && <div className="text-muted" style={{ fontSize: 12 }}>{t.description}</div>}
                        <div className="d-flex gap-1 mt-1 flex-wrap">
                          {inUse && <Badge bg="success">Đang dùng</Badge>}
                          {t.builtInKey && <Badge bg="light" text="dark">Có sẵn</Badge>}
                          {t.theme.effect !== 'none' && (
                            <Badge bg="light" text="dark">{EFFECTS.find((e) => e.value === t.theme.effect)?.label}</Badge>
                          )}
                        </div>
                      </div>
                      {t.builtInKey !== 'default' && (
                        <div className="d-flex flex-column gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            className="py-0 px-1"
                            title="Ghi đè bằng bộ màu đang chỉnh"
                            disabled={!!busy || selected}
                            onClick={() => overwriteTemplate(t)}
                          >
                            <ArrowRepeat />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            className="py-0 px-1"
                            title="Xóa template"
                            disabled={!!busy}
                            onClick={() => removeTemplate(t)}
                          >
                            <Trash />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Row className="g-4">
        <Col lg={6}>
          <div className="fw-medium small mb-2">Tùy chỉnh màu</div>
          {THEME_FIELDS.map((f) => (
            <Form.Group key={f.key} className="mb-2">
              <Form.Label className="small mb-1" htmlFor={`theme-${f.key}`}>
                {f.label} {f.hint && <span className="text-muted">- {f.hint}</span>}
              </Form.Label>
              <InputGroup size="sm">
                <Form.Control
                  type="color"
                  id={`theme-${f.key}`}
                  value={current[f.key]}
                  onChange={(e) => setColor(f.key, e.target.value)}
                  style={{ maxWidth: 48 }}
                  className="p-1"
                />
                <Form.Control
                  aria-label={`${f.label} (mã màu)`}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (/^#[0-9a-f]{6}$/i.test(v)) setColor(f.key, v.toLowerCase());
                  }}
                  onBlur={(e) => (e.target.value = current[f.key])}
                  style={{ maxWidth: 110, fontFamily: 'monospace' }}
                  key={current[f.key]}
                  defaultValue={current[f.key]}
                />
              </InputGroup>
            </Form.Group>
          ))}
          <Form.Group className="mb-2">
            <Form.Label className="small mb-1" htmlFor="theme-effect">
              Hiệu ứng trang trí <span className="text-muted">- hiện nhẹ trên trang khách hàng</span>
            </Form.Label>
            <Form.Select id="theme-effect" size="sm" value={current.effect} onChange={(e) => setColor('effect', e.target.value)} style={{ maxWidth: 220 }}>
              {EFFECTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Button variant="link" size="sm" className="px-0" onClick={() => onChange({ ...DEFAULT_THEME })}>
            Khôi phục màu mặc định
          </Button>
        </Col>
        <Col lg={6}>
          <div className="fw-medium small mb-2">Xem trước</div>
          <Preview theme={current} />
          <div className="fw-medium small mt-4 mb-2">Lưu bộ màu đang chỉnh thành template</div>
          <InputGroup size="sm">
            <Form.Control
              placeholder="Tên template, VD: Black Friday"
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button variant="outline-primary" disabled={!newName.trim() || !!busy} onClick={saveAsTemplate}>
              <Save className="me-1" />
              {busy === 'create' ? 'Đang lưu...' : 'Lưu template'}
            </Button>
          </InputGroup>
        </Col>
      </Row>
    </div>
  );
}
