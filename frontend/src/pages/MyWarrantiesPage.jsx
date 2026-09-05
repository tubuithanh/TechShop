import { useEffect, useState } from 'react';
import { Container, Card, Badge, Spinner, Alert, Stack, Button, Modal, Form, Row, Col } from 'react-bootstrap';
import { PlusLg, Image as ImageIcon } from 'react-bootstrap-icons';
import { warrantyService } from '../services/warrantyService';
import { orderService } from '../services/orderService';
import { resizeImageToDataUrl } from '../utils/imageUpload';
import {
  RETURN_REASON_OPTIONS,
  WARRANTY_METHOD_LABEL,
  WARRANTY_STATUS_LABEL,
  WARRANTY_STATUS_VARIANT,
  MAX_WARRANTY_IMAGES
} from '../constants/warranty';

const emptyForm = {
  orderId: '',
  productId: '',
  returnReason: RETURN_REASON_OPTIONS[0].value,
  issueDescription: '',
  method: 'bring_to_store',
  images: []
};

export default function MyWarrantiesPage() {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = () => warrantyService.getMyWarranties().then(setWarranties).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const openForm = () => {
    setError('');
    setForm(emptyForm);
    orderService.getMyOrders().then((data) => setOrders(data.filter((o) => o.status === 'delivered')));
    setShowForm(true);
  };

  const selectedOrder = orders.find((o) => o._id === form.orderId);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remainingSlots = MAX_WARRANTY_IMAGES - form.images.length;
    if (remainingSlots <= 0) {
      setError(`Chỉ được đính kèm tối đa ${MAX_WARRANTY_IMAGES} ảnh`);
      return;
    }
    const filesToUpload = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setError(`Chỉ còn ${remainingSlots} chỗ trống, ${files.length - remainingSlots} ảnh cuối sẽ không được tải lên`);
    } else {
      setError('');
    }
    setUploading(true);
    try {
      const dataUrls = await Promise.all(filesToUpload.map((f) => resizeImageToDataUrl(f)));
      setForm((prev) => ({ ...prev, images: [...prev.images, ...dataUrls] }));
    } catch (err) {
      setError(err.message || 'Tải ảnh lên thất bại');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.orderId || !form.productId) {
      setError('Vui lòng chọn đơn hàng và sản phẩm cần bảo hành');
      return;
    }
    if (!form.issueDescription.trim()) {
      setError('Vui lòng mô tả lỗi/tình trạng sản phẩm');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await warrantyService.createRequest(form);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gửi yêu cầu bảo hành thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  return (
    <Container className="py-4" style={{ maxWidth: '48rem' }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fs-4 fw-bold mb-0">Yêu cầu bảo hành của tôi</h1>
        <Button variant="primary" size="sm" onClick={openForm}>
          <PlusLg className="me-1" /> Gửi yêu cầu mới
        </Button>
      </div>

      {warranties.length === 0 ? (
        <Alert variant="light" className="border text-muted mb-0">
          Bạn chưa có yêu cầu bảo hành nào.
        </Alert>
      ) : (
        <Stack gap={3}>
          {warranties.map((w) => (
            <Card key={w._id} className="shadow-sm">
              <Card.Body>
                <div className="d-flex justify-content-between mb-1">
                  <span className="fw-medium">Phiếu #{w.ticketCode}</span>
                  <Badge bg={WARRANTY_STATUS_VARIANT[w.status] || 'secondary'}>{WARRANTY_STATUS_LABEL[w.status]}</Badge>
                </div>
                <div className="small text-muted">{w.productName}</div>
                {w.returnReason && (
                  <div className="small text-muted mt-1">
                    Lý do: {RETURN_REASON_OPTIONS.find((r) => r.value === w.returnReason)?.label || w.returnReason}
                  </div>
                )}
                <div className="small text-muted mt-1">Mô tả lỗi: {w.issueDescription}</div>
                <div className="small text-muted mt-1">Hình thức: {WARRANTY_METHOD_LABEL[w.method]}</div>
                {w.images?.length > 0 && (
                  <div className="d-flex gap-2 mt-2 flex-wrap">
                    {w.images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Ảnh minh chứng ${i + 1}`}
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
                        className="border"
                      />
                    ))}
                  </div>
                )}
                <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
                  Gửi lúc {new Date(w.createdAt).toLocaleString('vi-VN')}
                </div>
              </Card.Body>
            </Card>
          ))}
        </Stack>
      )}

      <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title className="fs-6">Gửi yêu cầu bảo hành mới</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label className="small fw-medium">Đơn hàng đã giao</Form.Label>
              <Form.Select
                required
                value={form.orderId}
                onChange={(e) => setForm({ ...form, orderId: e.target.value, productId: '' })}
              >
                <option value="">-- Chọn đơn hàng --</option>
                {orders.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.orderCode} — {new Date(o.createdAt).toLocaleDateString('vi-VN')}
                  </option>
                ))}
              </Form.Select>
              {orders.length === 0 && (
                <Form.Text className="text-muted">Bạn chưa có đơn hàng nào đã giao thành công.</Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-medium">Sản phẩm cần bảo hành</Form.Label>
              <Form.Select
                required
                disabled={!selectedOrder}
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">-- Chọn sản phẩm --</option>
                {selectedOrder?.items.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-medium">Lý do trả hàng / bảo hành</Form.Label>
                  <Form.Select
                    value={form.returnReason}
                    onChange={(e) => setForm({ ...form, returnReason: e.target.value })}
                  >
                    {RETURN_REASON_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-medium">Hình thức bảo hành</Form.Label>
                  <Form.Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                    {Object.entries(WARRANTY_METHOD_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-medium">Mô tả lỗi / tình trạng sản phẩm</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                required
                value={form.issueDescription}
                onChange={(e) => setForm({ ...form, issueDescription: e.target.value })}
                placeholder="Mô tả chi tiết lỗi gặp phải để chúng tôi hỗ trợ nhanh hơn..."
              />
            </Form.Group>

            <Form.Group>
              <Form.Label className="small fw-medium mb-2">
                Hình ảnh minh chứng ({form.images.length}/{MAX_WARRANTY_IMAGES})
              </Form.Label>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Form.Control
                  type="file"
                  accept="image/*"
                  multiple
                  size="sm"
                  disabled={uploading || form.images.length >= MAX_WARRANTY_IMAGES}
                  onChange={handleFileUpload}
                  style={{ maxWidth: 260 }}
                />
                {uploading && <Spinner animation="border" size="sm" />}
                <span className="text-muted small">
                  {form.images.length >= MAX_WARRANTY_IMAGES
                    ? `Đã đạt giới hạn ${MAX_WARRANTY_IMAGES} ảnh`
                    : 'Chụp ảnh lỗi/sản phẩm để hỗ trợ xử lý nhanh hơn'}
                </span>
              </div>
              {form.images.length > 0 && (
                <div className="d-flex gap-2 flex-wrap">
                  {form.images.map((img, idx) => (
                    <div key={idx} className="position-relative">
                      <img src={img} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} className="border" />
                      <Button
                        variant="danger"
                        size="sm"
                        className="position-absolute top-0 end-0 rounded-circle p-0 d-flex align-items-center justify-content-center"
                        style={{ width: 20, height: 20, transform: 'translate(30%, -30%)', fontSize: 12 }}
                        onClick={() => removeImage(idx)}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {form.images.length === 0 && (
                <div className="text-muted small d-flex align-items-center gap-1">
                  <ImageIcon /> Chưa có ảnh nào được đính kèm
                </div>
              )}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Đang gửi...' : 'Gửi yêu cầu bảo hành'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
