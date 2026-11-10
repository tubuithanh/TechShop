import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Container, Card, Badge, Spinner, Alert, Stack, Button, Modal, Form, Row, Col } from 'react-bootstrap';
import { PlusLg, Image as ImageIcon, JournalCheck, Tools, Search } from 'react-bootstrap-icons';
import { warrantyService } from '../services/warrantyService';
import MyWarrantyCards from '../components/MyWarrantyCards';
import { orderService } from '../services/orderService';
import { resizeImageToDataUrl } from '../utils/imageUpload';
import {
  RETURN_REASON_OPTIONS,
  WARRANTY_METHOD_LABEL,
  WARRANTY_STATUS_LABEL,
  WARRANTY_STATUS_VARIANT,
  WARRANTY_STATUS_OPTIONS,
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

// Các bước xử lý phiếu sửa chữa (bước "Chờ linh kiện" có thể không xảy ra)
const STEPS = WARRANTY_STATUS_OPTIONS.filter((s) => s !== 'waiting_parts');
const OPEN_STATUSES = ['received', 'checking', 'repairing', 'waiting_parts'];

function RepairSteps({ status }) {
  const current = status === 'waiting_parts' ? STEPS.indexOf('repairing') : STEPS.indexOf(status);
  return (
    <div className="repair-steps" aria-label="Tiến độ xử lý">
      {STEPS.map((s, i) => (
        <div key={s} className={`repair-step${i <= current ? ' done' : ''}${i === current ? ' current' : ''}`}>
          <span className="repair-step-dot" />
          <span className="repair-step-label">{s === 'repairing' && status === 'waiting_parts' ? 'Chờ linh kiện' : WARRANTY_STATUS_LABEL[s]}</span>
        </div>
      ))}
    </div>
  );
}

export default function MyWarrantiesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'repairs' ? 'repairs' : 'cards';
  const setTab = (t) => setParams(t === 'cards' ? {} : { tab: t }, { replace: true });
  const [cardCount, setCardCount] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('open');
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

  // prefill: { orderId, productId } khi bấm "Yêu cầu sửa chữa" từ 1 sổ bảo hành
  const openForm = (prefill = null) => {
    setError('');
    setForm(prefill?.orderId ? { ...emptyForm, orderId: String(prefill.orderId), productId: String(prefill.productId) } : emptyForm);
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
      setTicketFilter('open');
      setTab('repairs'); // xem ngay phiếu vừa gửi
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
    <Container className="py-4" style={{ maxWidth: '52rem' }}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Bảo hành</h1>
          <p className="small text-muted mb-0">
            Theo dõi hạn bảo hành từng sản phẩm, mua thêm thời gian bảo hành và gửi yêu cầu sửa chữa.{' '}
            <Link to="/chinh-sach-bao-hanh">Chính sách bảo hành</Link>
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openForm()}>
          <PlusLg className="me-1" /> Yêu cầu sửa chữa
        </Button>
      </div>

      <div className="account-tabs mb-3" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'cards'} className={`account-tab${tab === 'cards' ? ' active' : ''}`} onClick={() => setTab('cards')}>
          <JournalCheck /> Sổ bảo hành {cardCount != null && <span className="account-tab-count">{cardCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'repairs'} className={`account-tab${tab === 'repairs' ? ' active' : ''}`} onClick={() => setTab('repairs')}>
          <Tools /> Yêu cầu sửa chữa
          {warranties.length > 0 && (
            <span className={`account-tab-count${warranties.some((w) => OPEN_STATUSES.includes(w.status)) ? ' highlight' : ''}`}>
              {warranties.filter((w) => OPEN_STATUSES.includes(w.status)).length || warranties.length}
            </span>
          )}
        </button>
      </div>

      {/* Giữ tab sổ bảo hành luôn được tải (để có số đếm), chỉ ẩn khi xem tab khác */}
      <div hidden={tab !== 'cards'}>
        <MyWarrantyCards
          onLoaded={(list) => setCardCount(list.length)}
          onRequestRepair={(card) => openForm({ orderId: card.orderId, productId: card.productId })}
        />
      </div>

      {tab === 'repairs' && (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {[
              ['open', 'Đang xử lý', warranties.filter((w) => OPEN_STATUSES.includes(w.status)).length],
              ['closed', 'Đã hoàn tất', warranties.filter((w) => !OPEN_STATUSES.includes(w.status)).length],
              ['all', 'Tất cả', warranties.length]
            ].map(([k, label, n]) => (
              <button key={k} type="button" className={`btn btn-sm rounded-pill ${ticketFilter === k ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTicketFilter(k)}>
                {label} <span className="opacity-75">({n})</span>
              </button>
            ))}
            <Link to="/tra-cuu-bao-hanh" className="btn btn-sm btn-link ms-auto"><Search className="me-1" />Tra cứu bằng mã phiếu</Link>
          </div>
          {(() => {
            const list = warranties.filter((w) => ticketFilter === 'all' || (ticketFilter === 'open') === OPEN_STATUSES.includes(w.status));
            if (!list.length) {
              return (
                <div className="text-center text-muted py-5 border rounded-3 bg-body">
                  <div className="fs-1 mb-2">🔧</div>
                  {warranties.length ? 'Không có yêu cầu nào ở mục này.' : 'Bạn chưa gửi yêu cầu sửa chữa nào.'}
                  <div className="mt-3"><Button size="sm" variant="outline-primary" onClick={() => openForm()}>Gửi yêu cầu sửa chữa</Button></div>
                </div>
              );
            }
            return (
              <Stack gap={3}>
                {list.map((w) => (
                  <Card key={w._id} className="shadow-sm border-0">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                        <div>
                          <div className="fw-semibold">{w.productName}</div>
                          <div className="small text-muted">Phiếu <code>{w.ticketCode}</code> · gửi {new Date(w.createdAt).toLocaleDateString('vi-VN')} · {WARRANTY_METHOD_LABEL[w.method]}</div>
                        </div>
                        <div className="d-flex flex-column align-items-end gap-1">
                          <Badge bg={WARRANTY_STATUS_VARIANT[w.status] || 'secondary'}>{WARRANTY_STATUS_LABEL[w.status]}</Badge>
                          {w.coverage?.type === 'out_of_warranty' && <Badge bg="warning" text="dark" className="fw-normal">Sửa dịch vụ (tính phí)</Badge>}
                          {w.coverage?.type === 'manufacturer' && <Badge bg="info" text="dark" className="fw-normal">Bảo hành hãng</Badge>}
                        </div>
                      </div>
                      <RepairSteps status={w.status} />
                      <div className="small mt-2">
                        <span className="text-muted">Lỗi: </span>{w.issueDescription}
                        {w.returnReason && w.returnReason !== 'loi_nha_san_xuat' && (
                          <span className="text-muted"> · {RETURN_REASON_OPTIONS.find((r) => r.value === w.returnReason)?.label || w.returnReason}</span>
                        )}
                      </div>
                      {w.cost > 0 && <div className="small mt-1"><span className="text-muted">Chi phí: </span><strong>{w.cost.toLocaleString('vi-VN')}đ</strong></div>}
                      {w.images?.length > 0 && (
                        <div className="d-flex gap-2 mt-2 flex-wrap">
                          {w.images.map((img, i) => (
                            <img key={i} src={img} alt={`Ảnh minh chứng ${i + 1}`} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} className="border" />
                          ))}
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                ))}
              </Stack>
            );
          })()}
        </>
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
                  <option key={`${item.productId}-${item.variantId}`} value={item.productId}>
                    {item.name}
                    {item.variantLabel ? ` (${item.variantLabel})` : ''}
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
