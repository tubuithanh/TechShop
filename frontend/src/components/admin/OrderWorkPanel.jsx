import { useEffect, useState } from 'react';
import { Offcanvas, Button, Badge, Form, Spinner } from 'react-bootstrap';
import { TelephoneFill, GeoAltFill, ChevronLeft, ChevronRight, Truck, PencilSquare, ArrowLeftRight, XCircle, ArrowReturnLeft, CheckLg, Shop, Receipt } from 'react-bootstrap-icons';
import { orderService } from '../../services/orderService';
import { ORDER_LABELS, orderActions, orderLabel, orderMethod } from '../../utils/orderWorkflow';
import { primaryAction } from './OrderActions';
import api from '../../services/api';
import { EInvoiceModal } from '../../pages/admin/AdminEInvoicesPage';
import EInvoiceDraftModal from './EInvoiceDraftModal';
import { orderDateTime, timeAgo } from '../../utils/orderTime';

const money = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const FLOW_HOME = ['pending', 'confirmed', 'processing', 'shipping', 'delivered'];
const FLOW_PICKUP = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'delivered'];
const SHORT = { pending: 'Đặt hàng', confirmed: 'Xác nhận', processing: 'Chuẩn bị', shipping: 'Đang giao', ready_for_pickup: 'Sẵn sàng', delivered: 'Hoàn tất' };
const PAY = { cod: 'Thanh toán khi nhận (COD)', cash: 'Tiền mặt tại quầy', bank_transfer: 'Chuyển khoản', vnpay: 'VNPay', momo: 'MoMo' };
const locked = (o) => ['creating', 'unknown', 'active'].includes(o.shipment?.phase);

// KHUNG XỬ LÝ ĐƠN bên phải: chữ lớn, nút lớn, mọi thao tác hiện sẵn; xong 1 đơn tự nhảy sang đơn kế tiếp.
// list: danh sách đơn đang xem (để chuyển trước / sau); onRun(order, key) -> Promise
export default function OrderWorkPanel({ order, list, onClose, onRun, onSelect, onReceipt, busy, canDeliver }) {
  const [o, setO] = useState(order);
  const [autoNext, setAutoNext] = useState(() => { try { return localStorage.getItem('orders.autoNext') !== '0'; } catch { return true; } });
  const [loading, setLoading] = useState(false);
  useEffect(() => { setO(order); }, [order]);
  // Hóa đơn điện tử của đơn (đơn đã giao)
  const [einv, setEinv] = useState(undefined);
  const [einvOpen, setEinvOpen] = useState(null);
  const [einvBusy, setEinvBusy] = useState(false);
  const [einvMsg, setEinvMsg] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  useEffect(() => {
    setEinv(undefined); setEinvMsg('');
    if (o.status !== 'delivered') return;
    api.get(`/einvoices/by-order/${o._id}`).then((r) => setEinv(r.data.data.find((x) => x.status === 'issued') || null)).catch(() => setEinv(null));
  }, [o._id, o.status]);
  const issueEInvoice = async () => {
    setEinvBusy(true); setEinvMsg('');
    try { const r = await api.post(`/einvoices/orders/${o._id}/issue`, { sendEmail: true }); setEinv(r.data.data); setEinvMsg(r.data.data.emailQueuedTo ? `Đang gửi hóa đơn tới ${r.data.data.emailQueuedTo}` : 'Đã phát hành hóa đơn'); }
    catch (e) { setEinvMsg(e.response?.data?.message || 'Không phát hành được'); } finally { setEinvBusy(false); }
  };
  const idx = list.findIndex((x) => x._id === order._id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  // Phím tắt trong khung: ← → chuyển đơn, Enter = nút chính, Esc đóng
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight' && next) onSelect(next);
      if (e.key === 'ArrowLeft' && prev) onSelect(prev);
      if (e.key === 'Enter') { const p = primaryAction(o, { canDeliver }); if (p && !p.disabled && !busy) { e.preventDefault(); run(p.key); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const run = async (key) => {
    const before = o.status;
    await onRun(o, key);
    // Thao tác mở cửa sổ khác (phân công, sửa, hủy...) -> không tự chuyển
    if (!key.startsWith('status:') && !['confirm-payment', 'receive-return'].includes(key)) return;
    setLoading(true);
    try {
      const fresh = await orderService.getOrderById(o._id);
      setO(fresh);
      if (autoNext && fresh.status !== before && next) onSelect(next);
    } catch { /* giữ dữ liệu cũ */ } finally { setLoading(false); }
  };

  const flow = o.deliveryMethod === 'store_pickup' ? FLOW_PICKUP : FLOW_HOME;
  const at = flow.indexOf(o.status);
  const primary = primaryAction(o, { canDeliver });
  const t = orderActions(o);
  const others = [
    ...t.filter((s) => !['cancelled', 'returning'].includes(s) && `status:${s}` !== primary?.key).map((s) => ({ key: `status:${s}`, label: ORDER_LABELS[s], icon: CheckLg, variant: 'outline-primary' })),
    canDeliver && o.deliveryMethod === 'home_delivery' && ['confirmed', 'processing', 'shipping'].includes(o.status) && primary?.key !== 'deliver' && { key: 'deliver', label: 'Giao hàng', icon: Truck, variant: 'outline-primary' },
    !locked(o) && !o.activeTransferId && ['pending', 'confirmed'].includes(o.status) && { key: 'edit', label: 'Sửa người nhận', icon: PencilSquare, variant: 'outline-secondary' },
    !locked(o) && !o.activeTransferId && o.source !== 'pos' && ['pending', 'confirmed', 'processing'].includes(o.status) && !(['vnpay', 'momo'].includes(o.paymentMode) && o.paymentStatus !== 'paid') && { key: 'transfer', label: 'Điều phối chi nhánh', icon: ArrowLeftRight, variant: 'outline-secondary' },
    t.includes('returning') && { key: 'reason:returning', label: 'Khách trả hàng', icon: ArrowReturnLeft, variant: 'outline-danger' },
    t.includes('cancelled') && !o.activeTransferId && { key: 'reason:cancelled', label: 'Hủy đơn', icon: XCircle, variant: 'outline-danger' }
  ].filter(Boolean);
  const address = [o.deliveryAddress?.addressLine1, o.deliveryAddress?.addressLine2, o.deliveryAddress?.city].filter(Boolean).join(', ');

  return (
    <Offcanvas show onHide={onClose} placement="end" className="order-panel" scroll backdrop={false}>
      <Offcanvas.Header closeButton className="border-bottom">
        <div className="flex-grow-1">
          <Offcanvas.Title className="fs-4 fw-bold">#{o.orderCode} {loading && <Spinner size="sm" />}</Offcanvas.Title>
          <div className="text-muted">{orderMethod(o)} · {o.storeId?.name}</div>
          <div className="text-muted small">🕒 Đặt lúc <b className="text-body">{orderDateTime(o.createdAt)}</b> ({timeAgo(o.createdAt)})</div>
        </div>
        <div className="d-flex gap-1 me-2">
          {onReceipt && <Button variant="outline-secondary" onClick={() => onReceipt(o)} title="Xem / in hóa đơn"><Receipt className="me-1" />Hóa đơn</Button>}
          <Button variant="outline-secondary" disabled={!prev} onClick={() => onSelect(prev)} title="Đơn trước (←)"><ChevronLeft /></Button>
          <Button variant="outline-secondary" disabled={!next} onClick={() => onSelect(next)} title="Đơn sau (→)"><ChevronRight /></Button>
        </div>
      </Offcanvas.Header>
      <Offcanvas.Body className="d-flex flex-column gap-3">
        {/* Tiến trình */}
        {!['cancelled', 'returning', 'returned'].includes(o.status) ? (
          <div className="order-panel-steps">
            {flow.map((s, i) => <div key={s} className={i < at ? 'done' : i === at ? 'current' : ''}><span />{SHORT[s]}</div>)}
          </div>
        ) : <Badge bg={o.status === 'cancelled' ? 'danger' : 'warning'} text={o.status === 'cancelled' ? undefined : 'dark'} className="fs-6 align-self-start">{orderLabel(o)}</Badge>}

        {/* NÚT CHÍNH */}
        {primary ? (
          <Button size="lg" variant={primary.variant === 'outline-primary' ? 'primary' : primary.variant || 'secondary'} disabled={busy || primary.disabled} className="order-panel-primary" onClick={() => run(primary.key)}>
            {busy ? <Spinner size="sm" className="me-2" /> : <primary.icon className="me-2" />}{primary.label}
            {!primary.disabled && <span className="order-panel-kbd">Enter</span>}
          </Button>
        ) : <div className="text-center text-muted py-2 border rounded-3">{o.status === 'delivered' ? '✓ Đơn đã hoàn tất' : 'Không còn thao tác cho đơn này'}</div>}

        {others.length > 0 && (
          <div className="order-panel-actions">
            {others.map((x) => <Button key={x.key} variant={x.variant} disabled={busy} onClick={() => run(x.key)}><x.icon className="me-2" />{x.label}</Button>)}
          </div>
        )}
        {o.status === 'delivered' && einv !== undefined && (
          <div className="order-panel-box d-flex align-items-center gap-2">
            <span className="flex-grow-1">{einv ? <>🧾 Hóa đơn <b>{einv.template}{einv.series}-{String(einv.number).padStart(8, '0')}</b><span className="d-block small text-muted">Mã tra cứu {einv.lookupCode}</span></> : <>🧾 Chưa xuất hóa đơn điện tử</>}{einvMsg && <span className="d-block small text-primary">{einvMsg}</span>}</span>
            {einv ? <Button variant="outline-success" onClick={() => setEinvOpen(einv._id)}>Xem</Button> : <Button variant="success" disabled={einvBusy} onClick={() => setDraftOpen(true)}>Xem trước & xuất</Button>}
          </div>
        )}
        {o.status !== 'delivered' && !['cancelled', 'returned'].includes(o.status) && (
          <Button variant="link" className="p-0 text-start" onClick={() => setDraftOpen(true)}>🧾 Xem trước hóa đơn điện tử (phát hành được sau khi giao hàng)</Button>
        )}
        {draftOpen && <EInvoiceDraftModal orderId={o._id} onHide={() => setDraftOpen(false)} onIssued={(inv) => { setDraftOpen(false); setEinv(inv); setEinvMsg((inv.emailQueuedTo || inv.emailedTo) ? `Đã phát hành · đang gửi email tới ${inv.emailQueuedTo || inv.emailedTo}` : 'Đã phát hành hóa đơn'); setEinvOpen(inv._id); }} />}
        {einvOpen && <EInvoiceModal id={einvOpen} onHide={(nextId) => setEinvOpen(nextId || null)} onChanged={() => api.get(`/einvoices/by-order/${o._id}`).then((r) => setEinv(r.data.data.find((x) => x.status === 'issued') || null))} />}
        <Form.Check type="switch" id="auto-next" checked={autoNext} label="Xong đơn này tự chuyển sang đơn tiếp theo" className="text-muted"
          onChange={(e) => { setAutoNext(e.target.checked); try { localStorage.setItem('orders.autoNext', e.target.checked ? '1' : '0'); } catch { /* bỏ qua */ } }} />

        {/* Khách hàng */}
        <section className="order-panel-box">
          <div className="fs-5 fw-semibold">{o.deliveryAddress?.fullName || o.userId?.displayName || 'Khách lẻ'}</div>
          {o.deliveryAddress?.phone && <a href={`tel:${o.deliveryAddress.phone}`} className="fs-5 text-decoration-none"><TelephoneFill className="me-2" />{o.deliveryAddress.phone}</a>}
          {o.deliveryMethod === 'home_delivery' && address && <div className="mt-1"><GeoAltFill className="me-2 text-danger" />{address}</div>}
          {o.deliveryMethod === 'store_pickup' && <div className="mt-1"><Shop className="me-2" />Nhận tại {o.storeId?.name}</div>}
          {o.note && <div className="mt-2 p-2 rounded bg-warning-subtle">📝 {o.note}</div>}
        </section>

        {/* Hàng + tiền */}
        <section className="order-panel-box">
          {(o.items || []).map((i, k) => (
            <div key={k} className="d-flex align-items-center gap-2 py-1">
              {i.image && <img src={i.image} alt="" width={44} height={44} style={{ objectFit: 'contain' }} className="border rounded" />}
              <div className="flex-grow-1"><div className="fw-medium">{i.name}</div><div className="small text-muted">{i.variantLabel} × {i.quantity}</div></div>
              <div className="fw-medium">{money(i.unitPrice * i.quantity)}</div>
            </div>
          ))}
          <div className="d-flex justify-content-between border-top pt-2 mt-1 fs-5"><span>Tổng</span><b className="text-danger">{money(o.grandTotal)}</b></div>
          <div className="d-flex justify-content-between"><span className="text-muted">{PAY[o.paymentMode] || o.paymentMode}</span>
            <Badge bg={o.paymentStatus === 'paid' ? 'success' : o.paymentStatus === 'refunded' ? 'secondary' : 'warning'} text={['paid', 'refunded'].includes(o.paymentStatus) ? undefined : 'dark'}>{o.paymentStatus === 'paid' ? 'Đã thanh toán' : o.paymentStatus === 'refunded' ? 'Đã hoàn tiền' : 'Chưa thanh toán'}</Badge>
          </div>
        </section>

        {/* Lịch sử gần nhất */}
        {(o.statusHistory || []).length > 0 && (
          <section>
            <div className="fw-semibold mb-1"><Receipt className="me-1" />Lịch sử xử lý</div>
            <ul className="order-panel-history">
              {[...o.statusHistory].reverse().slice(0, 6).map((h, k) => (
                <li key={k}><b>{h.note || ORDER_LABELS[h.status]}</b><span className="d-block small text-muted">{h.actorName || 'Hệ thống'} · {new Date(h.changedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span></li>
              ))}
            </ul>
          </section>
        )}
        <div className="small text-muted mt-auto">Phím tắt: <kbd>Enter</kbd> làm bước tiếp theo · <kbd>←</kbd> <kbd>→</kbd> đơn trước / sau · <kbd>Esc</kbd> đóng</div>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
