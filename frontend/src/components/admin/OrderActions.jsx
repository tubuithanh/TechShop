import { useState } from 'react';
import { Button, Dropdown, Form, Modal, Badge } from 'react-bootstrap';
import { CheckLg, BoxSeam, Truck, BagCheck, ArrowReturnLeft, Cash, ThreeDots, PencilSquare, ArrowLeftRight, XCircle, CurrencyExchange, HourglassSplit, Shop, FileEarmarkText } from 'react-bootstrap-icons';
import { ORDER_LABELS, orderActions } from '../../utils/orderWorkflow';

const ACTIVE_SHIPMENT = ['creating', 'unknown', 'active'];
const shipmentLocked = (o) => ACTIVE_SHIPMENT.includes(o.shipment?.phase);
const onlineUnpaid = (o) => ['vnpay', 'momo'].includes(o.paymentMode) && o.paymentStatus !== 'paid';

// Lý do chọn nhanh khi hủy / nhận hàng trả
export const REASONS = {
  cancelled: ['Khách yêu cầu hủy', 'Không liên lạc được khách', 'Hết hàng / không đủ hàng', 'Khách đặt trùng đơn', 'Sai giá / sai thông tin sản phẩm', 'Nghi ngờ đơn ảo'],
  returning: ['Khách từ chối nhận hàng', 'Sản phẩm lỗi', 'Giao sai sản phẩm', 'Khách đổi ý (trong thời hạn đổi trả)', 'Giao thất bại nhiều lần']
};

// Bước tiếp theo của đơn: 1 nút chính rõ ràng (null = không cần làm gì)
export function primaryAction(o, { canDeliver } = {}) {
  // Đơn đã giao, đã thu tiền, chưa có hóa đơn điện tử -> bước tiếp theo là xuất hóa đơn
  if (o.status === 'delivered' && o.einvoice === null && o.paymentStatus !== 'refunded' && o.refundStatus !== 'completed'
    && !(['vnpay', 'momo', 'bank_transfer'].includes(o.paymentMode) && o.paymentStatus !== 'paid')) return { key: 'einvoice', label: 'Xuất hóa đơn', icon: FileEarmarkText, variant: 'success' };
  if (o.activeTransferId) return { key: 'wait', label: 'Chờ điều phối chi nhánh', icon: HourglassSplit, disabled: true };
  if (o.refundStatus === 'pending' && ['cancelled', 'returned'].includes(o.status)) return { key: 'refund', label: 'Hoàn tiền cho khách', icon: CurrencyExchange, variant: 'warning' };
  if (o.status === 'returning') return { key: 'receive-return', label: 'Đã nhận hàng trả', icon: ArrowReturnLeft, variant: 'warning' };
  if (o.paymentMode === 'bank_transfer' && o.paymentStatus !== 'paid' && ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping'].includes(o.status)) return { key: 'confirm-payment', label: 'Đã nhận chuyển khoản', icon: Cash, variant: 'success' };
  if (o.status === 'pending') return onlineUnpaid(o) ? { key: 'wait', label: 'Chờ khách thanh toán', icon: HourglassSplit, disabled: true } : { key: 'status:confirmed', label: 'Xác nhận đơn', icon: CheckLg, variant: 'primary' };
  if (o.status === 'confirmed' && orderActions(o).includes('processing')) return { key: 'status:processing', label: 'Bắt đầu chuẩn bị hàng', icon: BoxSeam, variant: 'primary' };
  if (o.status === 'processing' && o.deliveryMethod === 'store_pickup') return { key: 'status:ready_for_pickup', label: 'Sẵn sàng cho khách nhận', icon: Shop, variant: 'primary' };
  if (['confirmed', 'processing'].includes(o.status) && o.deliveryMethod === 'home_delivery' && !o.shipperId && !shipmentLocked(o)) {
    return canDeliver ? { key: 'deliver', label: 'Phân công giao hàng', icon: Truck, variant: 'primary' } : { key: 'wait', label: 'Chờ phân công giao hàng', icon: HourglassSplit, disabled: true };
  }
  if (o.deliveryMethod === 'store_pickup' && ['ready_for_pickup', 'shipping'].includes(o.status)) return { key: 'handover', label: 'Bàn giao cho khách', icon: BagCheck, variant: 'success' };
  if (['confirmed', 'processing', 'shipping'].includes(o.status) && (o.shipperId || shipmentLocked(o))) return { key: canDeliver ? 'deliver' : 'wait', label: o.status === 'shipping' ? 'Theo dõi giao hàng' : 'Đã phân công · theo dõi', icon: Truck, variant: 'outline-primary', disabled: !canDeliver };
  return null;
}

// Thanh tiến trình nhỏ của đơn
const FLOW_HOME = ['pending', 'confirmed', 'processing', 'shipping', 'delivered'];
const FLOW_PICKUP = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'delivered'];
export function MiniProgress({ o }) {
  if (['cancelled', 'returning', 'returned'].includes(o.status) || o.source === 'pos') return null;
  const flow = o.deliveryMethod === 'store_pickup' ? FLOW_PICKUP : FLOW_HOME;
  const at = flow.indexOf(o.status);
  return (
    <div className="order-mini-steps" title={flow.map((s) => ORDER_LABELS[s]).join(' → ')}>
      {flow.map((s, i) => <span key={s} className={i < at ? 'done' : i === at ? 'current' : ''} />)}
    </div>
  );
}

// Hộp thoại lý do (hủy đơn / nhận hàng trả) có lý do chọn nhanh
export function ReasonModal({ target, onHide, onSubmit }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  if (!target) return null;
  const { status, orders } = target;
  const text = [reason, note.trim()].filter(Boolean).join(' - ');
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title className="fs-5">{status === 'cancelled' ? 'Hủy' : 'Chuyển sang trả hàng'} {orders.length > 1 ? `${orders.length} đơn` : `đơn ${orders[0].orderCode}`}</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="small fw-medium mb-2">Chọn lý do</div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {REASONS[status].map((r) => <button key={r} type="button" className={`btn btn-sm rounded-pill ${reason === r ? 'btn-danger' : 'btn-outline-secondary'}`} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}
        </div>
        <Form.Control as="textarea" rows={2} placeholder="Ghi chú thêm (không bắt buộc nếu đã chọn lý do)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        {status === 'cancelled' && orders.some((o) => o.paymentStatus === 'paid') && <div className="small text-warning mt-2">Có đơn đã thanh toán: sau khi hủy, đơn chuyển sang "Chờ hoàn tiền".</div>}
        <div className="small text-muted mt-2">Tồn kho được hoàn lại, khách nhận thông báo kèm lý do.</div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Đóng</Button>
        <Button variant="danger" disabled={!text} onClick={() => onSubmit(text)}><XCircle className="me-1" />{status === 'cancelled' ? 'Hủy đơn' : 'Xác nhận trả hàng'}</Button>
      </Modal.Footer>
    </Modal>
  );
}

// Thao tác của 1 đơn: nút "bước tiếp theo" + menu ⋯ các thao tác phụ
export default function OrderActions({ o, busy, canDeliver, onRun }) {
  const primary = primaryAction(o, { canDeliver });
  const transitions = orderActions(o);
  const locked = !!o.activeTransferId;
  const extras = [
    ...transitions.filter((s) => !['cancelled', 'returning'].includes(s) && `status:${s}` !== primary?.key).map((s) => ({ key: `status:${s}`, label: `Chuyển sang "${ORDER_LABELS[s]}"`, icon: CheckLg })),
    !shipmentLocked(o) && !locked && ['pending', 'confirmed'].includes(o.status) && { key: 'edit', label: 'Sửa thông tin người nhận', icon: PencilSquare },
    !shipmentLocked(o) && !locked && o.source !== 'pos' && ['pending', 'confirmed', 'processing'].includes(o.status) && !onlineUnpaid(o) && { key: 'transfer', label: 'Điều phối sang chi nhánh khác', icon: ArrowLeftRight },
    canDeliver && o.deliveryMethod === 'home_delivery' && ['confirmed', 'processing', 'shipping'].includes(o.status) && primary?.key !== 'deliver' && { key: 'deliver', label: 'Giao hàng / vận đơn', icon: Truck },
    transitions.includes('returning') && { key: 'reason:returning', label: 'Khách trả hàng', icon: ArrowReturnLeft, danger: true },
    transitions.includes('cancelled') && !locked && { key: 'reason:cancelled', label: 'Hủy đơn', icon: XCircle, danger: true }
  ].filter(Boolean);
  return (
    <div className="order-actions">
      <MiniProgress o={o} />
      <div className="d-flex gap-1 align-items-stretch">
        {primary ? (
          <Button variant={primary.variant || 'secondary'} disabled={busy || primary.disabled} className="flex-grow-1 text-nowrap order-actions-main" onClick={() => onRun(o, primary.key)}>
            <primary.icon className="me-1" />{primary.label}
          </Button>
        ) : o.einvoice ? (
          <Button variant="outline-success" className="flex-grow-1 text-nowrap order-actions-main" onClick={() => onRun(o, 'einvoice-view')}><FileEarmarkText className="me-1" />HĐ {String(o.einvoice.number).padStart(8, '0')}</Button>
        ) : <span className="small text-muted flex-grow-1 align-self-center">{o.status === 'delivered' ? '✓ Hoàn tất' : o.status === 'cancelled' ? 'Đã hủy' : '—'}</span>}
        {extras.length > 0 && (
          <Dropdown align="end">
            <Dropdown.Toggle variant="outline-secondary" className="order-actions-more" disabled={busy} aria-label="Thao tác khác"><ThreeDots /></Dropdown.Toggle>
            <Dropdown.Menu popperConfig={{ strategy: 'fixed' }} renderOnMount>
              {extras.map((x, i) => (
                <div key={x.key}>
                  {x.danger && i > 0 && !extras[i - 1].danger && <Dropdown.Divider />}
                  <Dropdown.Item className={x.danger ? 'text-danger' : ''} onClick={() => onRun(o, x.key)}><x.icon className="me-2" />{x.label}</Dropdown.Item>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>
      {onlineUnpaid(o) && o.status === 'pending' && <Badge bg="light" text="dark" className="border fw-normal mt-1">Chưa thanh toán {o.paymentMode === 'vnpay' ? 'VNPay' : 'MoMo'}</Badge>}
    </div>
  );
}
