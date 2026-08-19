import { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Form, Button, Alert, InputGroup, Nav, Badge, Modal, Spinner } from 'react-bootstrap';
import {
  Gear, TelephoneFill, GridFill, Truck, Search, Tools,
  Facebook, Chat, Youtube, Instagram, ExclamationTriangleFill, ArrowCounterclockwise, Image
} from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';
import { useSettings } from '../../store/SettingsContext';

const TABS = [
  { key: 'general', label: 'Thông tin chung', icon: Gear },
  { key: 'contact', label: 'Liên hệ', icon: TelephoneFill },
  { key: 'display', label: 'Hiển thị & phân trang', icon: GridFill },
  { key: 'shipping', label: 'Vận chuyển', icon: Truck },
  { key: 'seo', label: 'SEO', icon: Search },
  { key: 'maintenance', label: 'Bảo trì', icon: Tools }
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const META_DESCRIPTION_LIMIT = 160;

function ImagePreview({ url, size = 40 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  if (!url) {
    return (
      <div
        className="d-flex align-items-center justify-content-center bg-light border rounded flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Image className="text-muted" />
      </div>
    );
  }
  return broken ? (
    <div
      className="d-flex align-items-center justify-content-center bg-danger-subtle border rounded flex-shrink-0 text-danger-emphasis"
      style={{ width: size, height: size, fontSize: 10 }}
      title="Không tải được ảnh từ URL này"
    >
      Lỗi
    </div>
  ) : (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="border rounded flex-shrink-0"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
      <Icon className="text-primary" /> {children}
    </h2>
  );
}

export default function AdminSettingsPage() {
  const { settings, loading: settingsLoading, refreshSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'danger', message }
  const [showMaintenanceConfirm, setShowMaintenanceConfirm] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(settings), [form, settings]);
  const emailError = form.contactEmail && !EMAIL_RE.test(form.contactEmail) ? 'Email không đúng định dạng' : null;

  const setField = (path, value) => {
    setForm((prev) => {
      const next = { ...prev };
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        next[parent] = { ...prev[parent], [child]: value };
      } else {
        next[path] = value;
      }
      return next;
    });
  };

  const doSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await settingService.updateSettings(form);
      await refreshSettings();
      setFeedback({ type: 'success', message: 'Đã lưu cấu hình hệ thống thành công.' });
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err.response?.data?.message || 'Không thể lưu cấu hình. Bạn cần quyền Admin để thực hiện thao tác này.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (emailError) {
      setActiveTab('contact');
      setFeedback({ type: 'danger', message: emailError });
      return;
    }
    // Bật bảo trì ảnh hưởng TOÀN BỘ khách truy cập - luôn xác nhận lại trước khi lưu
    if (form.maintenanceMode && !settings.maintenanceMode) {
      setShowMaintenanceConfirm(true);
      return;
    }
    doSave();
  };

  const handleDiscard = () => {
    setForm(settings);
    setFeedback(null);
  };

  if (settingsLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  const metaDescLength = (form.seo?.metaDescription || '').length;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Cấu hình hệ thống</h1>
          <p className="text-muted small mb-0">
            Thay đổi tại đây áp dụng ngay cho toàn bộ website (header, footer, phân trang, phí vận chuyển...)
          </p>
        </div>
        {isDirty && (
          <Badge bg="warning" text="dark" className="fw-normal py-2 px-3 rounded-pill">
            ● Có thay đổi chưa lưu
          </Badge>
        )}
      </div>

      {feedback && (
        <Alert variant={feedback.type} onClose={() => setFeedback(null)} dismissible>
          {feedback.message}
        </Alert>
      )}

      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          <Col md={3}>
            <Nav variant="pills" className="flex-column gap-1 sticky-top" style={{ top: '1rem' }}>
              {TABS.map((t) => (
                <Nav.Link
                  key={t.key}
                  active={activeTab === t.key}
                  onClick={() => setActiveTab(t.key)}
                  className="d-flex align-items-center gap-2 rounded-3 small fw-medium"
                >
                  <t.icon /> {t.label}
                  {t.key === 'contact' && emailError && <Badge bg="danger" className="ms-auto">!</Badge>}
                </Nav.Link>
              ))}
            </Nav>
          </Col>

          <Col md={9}>
            <Card className="shadow-sm border-0 rounded-4">
              <Card.Body>
                {activeTab === 'general' && (
                  <>
                    <SectionTitle icon={Gear}>Thông tin chung</SectionTitle>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Tên website</Form.Label>
                      <Form.Control value={form.siteName || ''} onChange={(e) => setField('siteName', e.target.value)} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Khẩu hiệu (tagline)</Form.Label>
                      <Form.Control value={form.tagline || ''} onChange={(e) => setField('tagline', e.target.value)} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Logo (URL)</Form.Label>
                      <div className="d-flex align-items-center gap-2">
                        <ImagePreview url={form.logoUrl} />
                        <Form.Control
                          value={form.logoUrl || ''}
                          onChange={(e) => setField('logoUrl', e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                    </Form.Group>
                    <Form.Group>
                      <Form.Label className="small fw-medium">Favicon (URL)</Form.Label>
                      <div className="d-flex align-items-center gap-2">
                        <ImagePreview url={form.faviconUrl} />
                        <Form.Control
                          value={form.faviconUrl || ''}
                          onChange={(e) => setField('faviconUrl', e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                    </Form.Group>
                  </>
                )}

                {activeTab === 'contact' && (
                  <>
                    <SectionTitle icon={TelephoneFill}>Thông tin liên hệ</SectionTitle>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Hotline</Form.Label>
                      <Form.Control value={form.hotline || ''} onChange={(e) => setField('hotline', e.target.value)} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Email hỗ trợ</Form.Label>
                      <Form.Control
                        type="email"
                        isInvalid={!!emailError}
                        value={form.contactEmail || ''}
                        onChange={(e) => setField('contactEmail', e.target.value)}
                      />
                      <Form.Control.Feedback type="invalid">{emailError}</Form.Control.Feedback>
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Địa chỉ</Form.Label>
                      <Form.Control
                        value={form.contactAddress || ''}
                        onChange={(e) => setField('contactAddress', e.target.value)}
                      />
                    </Form.Group>
                    <Form.Label className="small fw-medium d-block">Mạng xã hội</Form.Label>
                    <Row className="g-2">
                      <Col xs={6}>
                        <InputGroup size="sm">
                          <InputGroup.Text><Facebook /></InputGroup.Text>
                          <Form.Control
                            placeholder="Link Facebook"
                            value={form.socialLinks?.facebook || ''}
                            onChange={(e) => setField('socialLinks.facebook', e.target.value)}
                          />
                        </InputGroup>
                      </Col>
                      <Col xs={6}>
                        <InputGroup size="sm">
                          <InputGroup.Text><Chat /></InputGroup.Text>
                          <Form.Control
                            placeholder="Link Zalo"
                            value={form.socialLinks?.zalo || ''}
                            onChange={(e) => setField('socialLinks.zalo', e.target.value)}
                          />
                        </InputGroup>
                      </Col>
                      <Col xs={6}>
                        <InputGroup size="sm">
                          <InputGroup.Text><Youtube /></InputGroup.Text>
                          <Form.Control
                            placeholder="Link Youtube"
                            value={form.socialLinks?.youtube || ''}
                            onChange={(e) => setField('socialLinks.youtube', e.target.value)}
                          />
                        </InputGroup>
                      </Col>
                      <Col xs={6}>
                        <InputGroup size="sm">
                          <InputGroup.Text><Instagram /></InputGroup.Text>
                          <Form.Control
                            placeholder="Link Instagram"
                            value={form.socialLinks?.instagram || ''}
                            onChange={(e) => setField('socialLinks.instagram', e.target.value)}
                          />
                        </InputGroup>
                      </Col>
                    </Row>
                  </>
                )}

                {activeTab === 'display' && (
                  <>
                    <SectionTitle icon={GridFill}>Hiển thị & phân trang</SectionTitle>
                    <p className="small text-muted">
                      Áp dụng cho mọi danh sách có phân trang trong khu vực quản trị (sản phẩm, đơn hàng, khách hàng,
                      đánh giá, bảo hành, tin tức, tồn kho, nhật ký thao tác).
                    </p>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Số sản phẩm/bản ghi mỗi trang</Form.Label>
                      <Form.Control
                        type="number"
                        min={4}
                        max={100}
                        value={form.productsPerPage ?? 20}
                        onChange={(e) => setField('productsPerPage', Number(e.target.value))}
                      />
                      <Form.Text className="text-muted">Từ 4 đến 100 bản ghi/trang</Form.Text>
                    </Form.Group>
                    <Form.Group>
                      <Form.Label className="small fw-medium">Số ảnh tối đa mỗi sản phẩm</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        max={20}
                        value={form.maxImagesPerProduct ?? 10}
                        onChange={(e) => setField('maxImagesPerProduct', Number(e.target.value))}
                      />
                      <Form.Text className="text-muted">Áp dụng khi thêm/sửa sản phẩm ở trang Quản lý sản phẩm</Form.Text>
                    </Form.Group>
                  </>
                )}

                {activeTab === 'shipping' && (
                  <>
                    <SectionTitle icon={Truck}>Vận chuyển</SectionTitle>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Phí ship mặc định (đ)</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={form.defaultShippingFee ?? 30000}
                        onChange={(e) => setField('defaultShippingFee', Number(e.target.value))}
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label className="small fw-medium">Miễn phí ship cho đơn từ (đ)</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={form.freeShippingThreshold ?? 0}
                        onChange={(e) => setField('freeShippingThreshold', Number(e.target.value))}
                      />
                      <Form.Text className="text-muted">Để 0 nếu không áp dụng miễn phí vận chuyển</Form.Text>
                    </Form.Group>
                  </>
                )}

                {activeTab === 'seo' && (
                  <>
                    <SectionTitle icon={Search}>SEO</SectionTitle>
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-medium">Meta title</Form.Label>
                      <Form.Control
                        value={form.seo?.metaTitle || ''}
                        onChange={(e) => setField('seo.metaTitle', e.target.value)}
                        placeholder={form.siteName}
                      />
                      <Form.Text className="text-muted">Để trống sẽ dùng tên website làm tiêu đề trang</Form.Text>
                    </Form.Group>
                    <Form.Group>
                      <div className="d-flex justify-content-between align-items-center">
                        <Form.Label className="small fw-medium mb-1">Meta description</Form.Label>
                        <span className={`small ${metaDescLength > META_DESCRIPTION_LIMIT ? 'text-danger' : 'text-muted'}`}>
                          {metaDescLength}/{META_DESCRIPTION_LIMIT}
                        </span>
                      </div>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={form.seo?.metaDescription || ''}
                        onChange={(e) => setField('seo.metaDescription', e.target.value)}
                      />
                      <Form.Text className="text-muted">Khuyến nghị dưới {META_DESCRIPTION_LIMIT} ký tự để hiển thị đẹp trên kết quả tìm kiếm</Form.Text>
                    </Form.Group>
                  </>
                )}

                {activeTab === 'maintenance' && (
                  <>
                    <SectionTitle icon={Tools}>Chế độ bảo trì</SectionTitle>
                    <Form.Check
                      type="switch"
                      id="maintenance-switch"
                      label="Bật chế độ bảo trì (chặn toàn bộ khách truy cập, chỉ admin/staff xem được website)"
                      checked={!!form.maintenanceMode}
                      onChange={(e) => setField('maintenanceMode', e.target.checked)}
                      className="mb-3"
                    />
                    {form.maintenanceMode && (
                      <Alert variant="warning" className="small py-2">
                        <ExclamationTriangleFill className="me-1" />
                        Khi bật, khách chưa đăng nhập admin/staff sẽ chỉ thấy trang thông báo bảo trì ở mọi đường dẫn.
                      </Alert>
                    )}
                    <Form.Group>
                      <Form.Label className="small fw-medium">Thông điệp hiển thị cho khách khi bảo trì</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        value={form.maintenanceMessage || ''}
                        onChange={(e) => setField('maintenanceMessage', e.target.value)}
                      />
                    </Form.Group>
                  </>
                )}
              </Card.Body>
            </Card>

            <div className="d-flex gap-2 mt-3">
              <Button type="submit" variant="primary" disabled={saving || !isDirty}>
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </Button>
              <Button variant="outline-secondary" disabled={!isDirty || saving} onClick={handleDiscard}>
                <ArrowCounterclockwise className="me-1" /> Hủy thay đổi
              </Button>
            </div>
          </Col>
        </Row>
      </Form>

      <Modal show={showMaintenanceConfirm} onHide={() => setShowMaintenanceConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 d-flex align-items-center gap-2">
            <ExclamationTriangleFill className="text-warning" /> Xác nhận bật chế độ bảo trì
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          Toàn bộ khách truy cập chưa đăng nhập admin/staff sẽ <strong>không thể sử dụng website</strong> cho đến khi bạn
          tắt chế độ này. Bạn có chắc chắn muốn tiếp tục?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setShowMaintenanceConfirm(false)}>
            Hủy
          </Button>
          <Button
            variant="warning"
            size="sm"
            onClick={() => {
              setShowMaintenanceConfirm(false);
              doSave();
            }}
          >
            Xác nhận bật bảo trì
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
