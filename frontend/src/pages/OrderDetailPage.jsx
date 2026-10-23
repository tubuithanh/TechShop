import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Container, Alert, ListGroup, Card, Button, Form, Spinner } from 'react-bootstrap';
import { orderService } from '../services/orderService';
import { warrantyService } from '../services/warrantyService';
import { paymentService, PAYMENT_GATEWAYS } from '../services/paymentService';
import { getAccessToken } from '../services/api';
import { connectSocket } from '../services/socket';

const statusSteps = ['pending', 'confirmed', 'processing', 'shipping', 'delivered'];
const statusLabel = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả'
};

const paymentStatusLabel = {
  pending: { text: 'Chưa thanh toán', bg: 'warning' },
  paid: { text: 'Đã thanh toán', bg: 'success' },
  failed: { text: 'Thanh toán thất bại', bg: 'danger' },
  refunded: { text: 'Đã hoàn tiền', bg: 'secondary' }
};

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [warrantyForm, setWarrantyForm] = useState({ productId: '', issueDescription: '' });
  const [warrantyMsg, setWarrantyMsg] = useState(null); // { ok, text }
  // Phiếu bảo hành CHƯA XỬ LÝ XONG của đơn này, theo sản phẩm: productId -> mã phiếu. Sản phẩm đang bảo hành
  // không gửi thêm phiếu được (backend chặn 409) - khi phiếu cũ hoàn tất / trả máy thì gửi phiếu mới được.
  const [openWarranties, setOpenWarranties] = useState({});
  const loadOpenWarranties = () =>
    warrantyService.getMyWarranties().then((list) =>
      setOpenWarranties(
        Object.fromEntries(
          list
            .filter((w) => String(w.orderId) === id && !['done', 'returned'].includes(w.status))
            .map((w) => [String(w.productId), w.ticketCode])
        )
      )
    ).catch(() => {});
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(location.state?.paymentError || '');

  const handlePay = async () => {
    setPaying(true);
    setPaymentError('');
    try {
      await paymentService.start(order.paymentMode, id);
    } catch (err) {
      setPaymentError(err.response?.data?.message || `Không mở được cổng thanh toán ${PAYMENT_GATEWAYS[order.paymentMode]?.label || ''}`);
      setPaying(false);
    }
  };

  useEffect(() => {
    orderService.getOrderById(id).then(setOrder);
  }, [id]);

  useEffect(() => {
    if (order?.status === 'delivered') loadOpenWarranties();
  }, [order?.status, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!getAccessToken()) return;
    const socket = connectSocket();
    socket.on('order:statusUpdated', (payload) => {
      if (payload.orderId === id) {
        orderService.getOrderById(id).then(setOrder);
      }
    });
    return () => socket.disconnect();
  }, [id]);

  const handleCancel = async () => {
    if (!confirm('Bạn chắc chắn muốn hủy đơn hàng này?')) return;
    const updated = await orderService.cancelOrder(id, 'Khách hàng yêu cầu hủy');
    setOrder(updated);
  };

  const handleWarrantyRequest = async (e) => {
    e.preventDefault();
    try {
      const created = await warrantyService.createRequest({ orderId: id, ...warrantyForm });
      setWarrantyMsg({ ok: true, text: `Đã gửi yêu cầu bảo hành (mã phiếu ${created.ticketCode}). Vui lòng theo dõi trong mục "Bảo hành".` });
      setWarrantyForm({ productId: '', issueDescription: '' });
    } catch (err) {
      setWarrantyMsg({ ok: false, text: err.response?.data?.message || 'Có lỗi xảy ra' });
    }
    loadOpenWarranties();
  };

  if (!order)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  const currentStepIndex = statusSteps.indexOf(order.status);

  return (
    <Container className="py-4" style={{ maxWidth: '48rem' }}>
      {location.state?.justPlaced && (
        <Alert variant="success" className="mb-4">
          🎉 Đặt hàng thành công! Mã đơn hàng của bạn là <strong>{order.orderCode}</strong>
        </Alert>
      )}

      <h1 className="fs-4 fw-bold mb-1">Đơn hàng #{order.orderCode}</h1>
      <p className="small text-muted mb-1">Đặt ngày {new Date(order.createdAt).toLocaleString('vi-VN')}</p>
      <p className="small text-muted mb-4">
        Xử lý tại: <strong>{order.storeId?.name}</strong> ({order.storeId?.address})
      </p>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-4 small">
        <span>
          Thanh toán: {order.paymentMode === 'cod' ? 'Khi nhận hàng (COD)' : PAYMENT_GATEWAYS[order.paymentMode]?.label || order.paymentMode}
        </span>
        <span className={`badge text-bg-${paymentStatusLabel[order.paymentStatus]?.bg || 'secondary'}`}>
          {paymentStatusLabel[order.paymentStatus]?.text || order.paymentStatus}
        </span>
        {PAYMENT_GATEWAYS[order.paymentMode] &&
          !['paid', 'refunded'].includes(order.paymentStatus) &&
          !['cancelled', 'returned'].includes(order.status) && (
            <Button size="sm" variant="primary" onClick={handlePay} disabled={paying}>
              {paying
                ? `Đang chuyển sang ${PAYMENT_GATEWAYS[order.paymentMode].label}...`
                : order.paymentStatus === 'failed'
                  ? 'Thanh toán lại'
                  : 'Thanh toán ngay'}
            </Button>
          )}
      </div>
      {paymentError && (
        <Alert variant="warning" className="small">
          {paymentError}
        </Alert>
      )}

      {order.status !== 'cancelled' && order.status !== 'returned' && (
        <div className="d-flex justify-content-between mb-5" style={{ fontSize: '0.75rem' }}>
          {statusSteps.map((s, idx) => (
            <div key={s} className="flex-fill text-center position-relative">
              <div
                className={`rounded-circle mx-auto d-flex align-items-center justify-content-center text-white ${
                  idx <= currentStepIndex ? 'bg-primary' : 'bg-secondary'
                }`}
                style={{ width: '1.5rem', height: '1.5rem' }}
              >
                {idx + 1}
              </div>
              <div className="mt-1">{statusLabel[s]}</div>
            </div>
          ))}
        </div>
      )}
      {order.status === 'cancelled' && (
        <Alert variant="danger" className="mb-4 small">
          Đơn hàng đã bị hủy: {order.cancelReason}
        </Alert>
      )}

      <ListGroup className="mb-4">
        {order.items.map((item, idx) => (
          <ListGroup.Item key={idx} className="d-flex justify-content-between small">
            <span>
              {item.name}
              {item.variantLabel && <span className="text-muted"> ({item.variantLabel})</span>} x{item.quantity}
            </span>
            <span>{formatVND(item.unitPrice * item.quantity)}</span>
          </ListGroup.Item>
        ))}
      </ListGroup>

      <Card className="mb-4">
        <Card.Body className="small">
          <div className="d-flex justify-content-between">
            <span>Tạm tính</span>
            <span>{formatVND(order.itemsTotal)}</span>
          </div>
          <div className="d-flex justify-content-between">
            <span>Phí vận chuyển</span>
            <span>{formatVND(order.shippingFee)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="d-flex justify-content-between text-success">
              <span>Giảm giá</span>
              <span>-{formatVND(order.discountAmount)}</span>
            </div>
          )}
          <div className="d-flex justify-content-between fw-bold border-top pt-2 mt-2">
            <span>Tổng cộng</span>
            <span className="text-primary">{formatVND(order.grandTotal)}</span>
          </div>
        </Card.Body>
      </Card>

      <div className="small mb-4">
        <div className="fw-medium mb-1">Địa chỉ nhận hàng</div>
        <div>
          {order.deliveryAddress?.fullName} - {order.deliveryAddress?.phone}
        </div>
        <div>
          {order.deliveryAddress?.addressLine1}, {order.deliveryAddress?.addressLine2}, {order.deliveryAddress?.city}
        </div>
      </div>

      {['pending', 'confirmed'].includes(order.status) && (
        <Button variant="outline-danger" size="sm" onClick={handleCancel} className="mb-5">
          Hủy đơn hàng
        </Button>
      )}

      {order.status === 'delivered' && (
        <div className="border-top pt-4">
          <h3 className="fw-bold fs-6 mb-3">Gửi yêu cầu bảo hành</h3>
          <Form onSubmit={handleWarrantyRequest} style={{ maxWidth: '28rem' }}>
            <Form.Select
              required
              value={warrantyForm.productId}
              onChange={(e) => setWarrantyForm({ ...warrantyForm, productId: e.target.value })}
              className="mb-2"
              size="sm"
            >
              <option value="">-- Chọn sản phẩm cần bảo hành --</option>
              {order.items.map((item) => (
                <option
                  key={`${item.productId}-${item.variantId}`}
                  value={item.productId}
                  disabled={Boolean(openWarranties[String(item.productId)])}
                >
                  {item.name}
                  {item.variantLabel ? ` (${item.variantLabel})` : ''}
                  {openWarranties[String(item.productId)] ? ` - đang bảo hành (${openWarranties[String(item.productId)]})` : ''}
                </option>
              ))}
            </Form.Select>
            <Form.Control
              as="textarea"
              required
              placeholder="Mô tả lỗi sản phẩm..."
              value={warrantyForm.issueDescription}
              onChange={(e) => setWarrantyForm({ ...warrantyForm, issueDescription: e.target.value })}
              className="mb-2"
              rows={3}
              size="sm"
            />
            <Button type="submit" variant="dark" size="sm">
              Gửi yêu cầu bảo hành
            </Button>
          </Form>
          {warrantyMsg && <div className={`small mt-2 ${warrantyMsg.ok ? 'text-success' : 'text-danger'}`}>{warrantyMsg.text}</div>}
        </div>
      )}
    </Container>
  );
}
