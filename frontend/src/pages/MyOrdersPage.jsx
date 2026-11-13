import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Badge, Spinner, Alert, Stack, Button, Form, InputGroup } from 'react-bootstrap';
import { Search, StarFill, Truck, CreditCard, ArrowRepeat, ShieldCheck, XCircle, ChevronRight, BoxSeam } from 'react-bootstrap-icons';
import { orderService } from '../services/orderService';
import { useCart } from '../store/CartContext';
import { orderLabel, orderMethod, money } from '../utils/orderWorkflow';
import { placeholderImage } from '../utils/placeholderImage';
import ClaimPosOrder from '../components/ClaimPosOrder';

// Tab theo góc nhìn khách (gom các trạng thái kỹ thuật - khớp MY_ORDER_GROUPS ở backend)
const TABS = [
  ['', 'Tất cả'],
  ['processing', 'Chờ xử lý'],
  ['shipping', 'Đang giao'],
  ['delivered', 'Đã nhận'],
  ['closed', 'Hủy / Trả hàng']
];

const statusVariant = {
  pending: 'warning', confirmed: 'info', processing: 'info', ready_for_pickup: 'info', shipping: 'primary',
  delivered: 'success', cancelled: 'danger', returning: 'warning', returned: 'secondary'
};

// Các bước hiển thị trên thanh tiến trình nhỏ
const STEPS = ['Đặt hàng', 'Xác nhận', 'Đang giao', 'Đã nhận'];
const stepIndex = { pending: 0, confirmed: 1, processing: 1, shipping: 2, ready_for_pickup: 2, delivered: 3 };

// Câu gợi ý "bây giờ đơn đang thế nào / bạn cần làm gì"
function hint(o) {
  const online = ['vnpay', 'momo'].includes(o.paymentMode);
  switch (o.status) {
    case 'pending': return online && o.paymentStatus !== 'paid' ? 'Đơn chưa được thanh toán - hoàn tất thanh toán để cửa hàng xử lý' : 'Cửa hàng đang xác nhận đơn của bạn';
    case 'confirmed':
    case 'processing': return 'Cửa hàng đang chuẩn bị hàng';
    case 'ready_for_pickup': return `Hàng đã sẵn sàng - mời bạn đến nhận tại ${o.storeId?.name || 'cửa hàng'}`;
    case 'shipping': return o.shipment?.code ? `Đang giao · Mã vận đơn ${o.shipment.code}` : 'Đơn đang trên đường giao tới bạn';
    case 'delivered': return o.toReview?.length ? 'Đã nhận hàng - hãy đánh giá để giúp người mua khác' : 'Giao hàng thành công';
    case 'cancelled': return o.paymentStatus === 'refunded' ? `Đã hủy · Đã hoàn ${money(o.grandTotal)}` : o.refundStatus && o.refundStatus !== 'none' ? 'Đã hủy · Đang hoàn tiền' : 'Đơn đã hủy';
    case 'returning': return 'Đang xử lý trả hàng';
    case 'returned': return 'Đã trả hàng';
    default: return '';
  }
}

function Progress({ status }) {
  const at = stepIndex[status];
  if (at === undefined) return null;
  return (
    <div className="order-steps my-2" aria-label={`Tiến trình: ${STEPS[at]}`}>
      {STEPS.map((label, i) => (
        <div key={label} className={`order-step ${i <= at ? 'done' : ''} ${i === at ? 'current' : ''}`}>
          <span className="dot" />
          <span className="label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function MyOrdersPage() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [params, setParams] = useSearchParams();
  const group = params.get('tab') || '';
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ groupCounts: {}, counts: {}, totalPages: 0, todo: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reload, setReload] = useState(0);

  // Gõ tìm kiếm: chờ 400ms rồi mới gọi API
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 400); return () => clearTimeout(t); }, [qInput]);

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    orderService.getMyOrdersPage({ page, group: group || undefined, q: q || undefined, limit: 10 }).then((r) => {
      if (!live) return;
      setOrders(r.data); setMeta(r);
      if (page > Math.max(1, r.totalPages)) setPage(Math.max(1, r.totalPages));
    }).catch((e) => { if (live) { setOrders([]); setError(e.response?.data?.message || 'Không tải được đơn hàng'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, group, q, reload]);

  const setTab = (key) => { setPage(1); setParams(key ? { tab: key } : {}); };
  const totalAll = Object.values(meta.counts || {}).reduce((a, b) => a + b, 0);

  const cancel = async (o) => {
    if (!window.confirm(`Hủy đơn #${o.orderCode}?`)) return;
    setBusy(o._id);
    try { await orderService.cancelOrder(o._id, 'Khách hàng yêu cầu hủy'); setReload((n) => n + 1); }
    catch (e) { alert(e.response?.data?.message || 'Không hủy được đơn'); }
    finally { setBusy(''); }
  };

  // Mua lại: thêm tất cả sản phẩm của đơn vào giỏ (cùng cửa hàng), bỏ qua sản phẩm đã hết hàng
  const buyAgain = async (o) => {
    setBusy(o._id);
    let failed = 0;
    for (const it of o.items) {
      try { await addToCart(it.productId?._id || it.productId, it.variantId, it.quantity, o.storeId?._id || o.storeId); }
      catch { failed += 1; }
    }
    setBusy('');
    if (failed === o.items.length) return alert('Các sản phẩm trong đơn hiện không còn hàng');
    if (failed) alert(`${failed} sản phẩm không còn hàng nên chưa được thêm vào giỏ`);
    navigate('/cart');
  };

  const todo = meta.todo || {};
  const todoCards = [
    todo.unpaid > 0 && { key: 'unpaid', icon: <CreditCard />, text: `${todo.unpaid} đơn chưa thanh toán`, tab: 'processing', variant: 'warning' },
    todo.shipping > 0 && { key: 'ship', icon: <Truck />, text: `${todo.shipping} đơn đang giao tới bạn`, tab: 'shipping', variant: 'primary' },
    todo.toReview > 0 && { key: 'review', icon: <StarFill />, text: `${todo.toReview} sản phẩm chờ bạn đánh giá`, tab: 'delivered', variant: 'success' }
  ].filter(Boolean);

  return (
    <div style={{ maxWidth: '52rem' }}>
      <h1 className="fs-4 fw-bold mb-3">Đơn hàng của tôi</h1>
      <ClaimPosOrder onClaimed={() => setReload((n) => n + 1)} />

      {/* Cần bạn làm */}
      {todoCards.length > 0 && (
        <div className="order-todo mb-3">
          {todoCards.map((c) => (
            <button key={c.key} type="button" onClick={() => setTab(c.tab)} className={`order-todo-card border-${c.variant}-subtle bg-${c.variant}-subtle text-${c.variant}-emphasis`}>
              <span className="fs-5">{c.icon}</span>
              <span className="small fw-medium flex-grow-1 text-start">{c.text}</span>
              <ChevronRight size={12} />
            </button>
          ))}
        </div>
      )}

      {/* Tab */}
      <div className="order-tabs mb-3" role="tablist">
        {TABS.map(([key, label]) => {
          const n = key ? meta.groupCounts?.[key] || 0 : totalAll;
          const attention = (key === 'delivered' && todo.toReview > 0) || (key === 'processing' && todo.unpaid > 0);
          return (
            <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => setTab(key)}
              className={`order-tab ${group === key ? 'active' : ''} ${n === 0 && key ? 'empty' : ''}`}>
              {label} <span className="count">{n}</span>
              {attention && <span className="attention" aria-label="cần chú ý" />}
            </button>
          );
        })}
      </div>

      <InputGroup size="sm" className="mb-3">
        <InputGroup.Text><Search /></InputGroup.Text>
        <Form.Control placeholder="Tìm theo mã đơn hoặc tên sản phẩm" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="Tìm đơn hàng" />
      </InputGroup>

      {error && <Alert variant="danger">{error} <Button size="sm" variant="link" onClick={() => setReload((n) => n + 1)}>Thử lại</Button></Alert>}
      {loading && !orders.length ? <Spinner animation="border" /> : !error && orders.length === 0 ? (
        <div className="text-center text-muted border rounded-3 py-5">
          <BoxSeam size={40} className="mb-2 opacity-50" />
          <div>{q ? `Không tìm thấy đơn nào khớp "${q}"` : group ? 'Chưa có đơn nào ở mục này' : 'Bạn chưa có đơn hàng nào'}</div>
          {!q && !group && <Button as={Link} to="/" size="sm" className="mt-3">Mua sắm ngay</Button>}
        </div>
      ) : (
        <Stack gap={3} className={loading ? 'opacity-50' : ''}>
          {orders.map((o) => {
            const first = o.items[0] || {};
            const online = ['vnpay', 'momo'].includes(o.paymentMode);
            const canCancel = ['pending', 'confirmed'].includes(o.status);
            const detail = `/account/orders/${o._id}`;
            return (
              <Card key={o._id} className="shadow-sm order-card">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center gap-2 mb-2 small">
                    <span className="text-muted text-truncate">
                      <b className="text-body">#{o.orderCode}</b> · {new Date(o.createdAt).toLocaleDateString('vi-VN')} · {orderMethod(o)} · {o.storeId?.name}
                    </span>
                    <Badge bg={statusVariant[o.status] || 'secondary'} className="flex-shrink-0">{orderLabel(o)}</Badge>
                  </div>

                  <Link to={detail} className="d-flex gap-3 text-decoration-none text-body">
                    <img src={first.image || placeholderImage(64, 64)} alt="" className="rounded border flex-shrink-0" style={{ width: 64, height: 64, objectFit: 'contain' }} />
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-medium text-truncate">{first.name}</div>
                      <div className="small text-muted">
                        {first.variantLabel && <>{first.variantLabel} · </>}x{first.quantity}
                        {o.items.length > 1 && <> · <span className="text-primary">+{o.items.length - 1} sản phẩm khác</span></>}
                      </div>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <div className="small text-muted">Tổng tiền</div>
                      <div className="fw-bold text-primary">{money(o.grandTotal)}</div>
                    </div>
                  </Link>

                  <Progress status={o.status} />
                  <div className={`small ${o.status === 'cancelled' ? 'text-muted' : 'text-body-secondary'} mb-2`}>{hint(o)}</div>

                  <div className="d-flex flex-wrap gap-2 justify-content-end">
                    {o.status === 'pending' && online && o.paymentStatus !== 'paid' && (
                      <Button size="sm" variant="warning" as={Link} to={detail}><CreditCard className="me-1" />Thanh toán</Button>
                    )}
                    {canCancel && (
                      <Button size="sm" variant="outline-danger" disabled={busy === o._id} onClick={() => cancel(o)}><XCircle className="me-1" />Hủy đơn</Button>
                    )}
                    {o.status === 'shipping' && (
                      <Button size="sm" variant="primary" as={Link} to={detail}><Truck className="me-1" />Theo dõi vận chuyển</Button>
                    )}
                    {o.status === 'delivered' && o.toReview?.length > 0 && (
                      <Button size="sm" variant="primary" as={Link} to={`${detail}#review`}><StarFill className="me-1" />Đánh giá</Button>
                    )}
                    {o.status === 'delivered' && (
                      <Button size="sm" variant="outline-secondary" as={Link} to="/account/warranties"><ShieldCheck className="me-1" />Bảo hành</Button>
                    )}
                    {['delivered', 'cancelled', 'returned'].includes(o.status) && (
                      <Button size="sm" variant="outline-primary" disabled={busy === o._id} onClick={() => buyAgain(o)}><ArrowRepeat className="me-1" />Mua lại</Button>
                    )}
                    <Button size="sm" variant="link" as={Link} to={detail} className="text-decoration-none">Xem chi tiết</Button>
                  </div>
                </Card.Body>
              </Card>
            );
          })}
        </Stack>
      )}

      {meta.totalPages > 1 && (
        <div className="d-flex gap-3 align-items-center justify-content-center mt-3 small">
          <Button size="sm" variant="outline-secondary" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button>
          <span>Trang {page} / {meta.totalPages} · {meta.total} đơn</span>
          <Button size="sm" variant="outline-secondary" disabled={loading || page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
        </div>
      )}
    </div>
  );
}
