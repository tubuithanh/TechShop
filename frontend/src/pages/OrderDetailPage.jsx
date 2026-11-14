import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { Container, Alert, ListGroup, Card, Button, Form, Spinner } from 'react-bootstrap';
import { orderService } from '../services/orderService';
import { warrantyService } from '../services/warrantyService';
import { paymentService, PAYMENT_GATEWAYS } from '../services/paymentService';
import { getAccessToken } from '../services/api';
import { connectSocket } from '../services/socket';
import { ORDER_LABELS, orderMethod } from '../utils/orderWorkflow';
import VatBreakdown from '../components/VatBreakdown';
import ShipmentTracking from '../components/ShipmentTracking';
import OrderReviewButton from '../components/OrderReviewButton';
import OrderEInvoice from '../components/OrderEInvoice';
import { orderDateTime, timeAgo } from '../utils/orderTime';

const homeSteps = ['pending', 'confirmed', 'processing', 'shipping', 'delivered']; // các bước của thanh tiến trình
const statusLabel = {
  ...ORDER_LABELS,
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
  const { id } = useParams(); // mã đơn trên URL /account/orders/:id
  const location = useLocation();
  const [order, setOrder] = useState(null); // null = đang tải
  const [warrantyForm, setWarrantyForm] = useState({ productId: '', issueDescription: '' });
  const [warrantyMsg, setWarrantyMsg] = useState(null); // { ok, text }
  // Phiếu bảo hành CHƯA XỬ LÝ XONG của đơn này, theo sản phẩm: productId -> mã phiếu. Sản phẩm đang bảo hành
  // không gửi thêm phiếu được (backend chặn 409) - khi phiếu cũ hoàn tất / trả máy thì gửi phiếu mới được.
  const [openWarranties, setOpenWarranties] = useState({});
  const loadOpenWarranties = () =>
    warrantyService.getMyWarranties().then((list) => // phiếu bảo hành của khách
      setOpenWarranties(
        Object.fromEntries(
          list
            .filter((w) => String(w.orderId) === id && !['done', 'returned'].includes(w.status)) // phiếu của đơn này còn đang xử lý
            .map((w) => [String(w.productId), w.ticketCode])
        )
      )
    ).catch(() => {});
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(location.state?.paymentError || ''); // lỗi mở cổng truyền từ trang thanh toán

  const handlePay = async () => {
    setPaying(true);
    setPaymentError('');
    try {
      await paymentService.start(order.paymentMode, id); // xin link thanh toán rồi chuyển trang
    } catch (err) {
      setPaymentError(err.response?.data?.message || `Không mở được cổng thanh toán ${PAYMENT_GATEWAYS[order.paymentMode]?.label || ''}`);
      setPaying(false); // chỉ mở lại nút khi lỗi (thành công thì đã rời trang)
    }
  };

  // Đơn không tồn tại / đã bị xóa / không thuộc tài khoản này -> báo lỗi thay vì quay vòng tải mãi
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    setLoadError('');
    orderService
      .getOrderById(id) // tải chi tiết đơn
      .then(setOrder)
      .catch((err) =>
        setLoadError(
          [400, 403, 404].includes(err.response?.status) // đơn không tồn tại / không phải của mình
            ? 'Đơn hàng không tồn tại hoặc không còn nữa.'
            : 'Không tải được đơn hàng, vui lòng thử lại sau.'
        )
      );
  }, [id]);

  // Từ danh sách đơn bấm "Đánh giá" -> cuộn tới danh sách sản phẩm
  useEffect(() => {
    if (order && window.location.hash === '#review') document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [order?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (order?.status === 'delivered') loadOpenWarranties(); // chỉ đơn đã giao mới gửi bảo hành
  }, [order?.status, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!getAccessToken()) return; // chưa đăng nhập -> không kết nối real-time
    const socket = connectSocket(); // kết nối Socket.IO
    socket.on('order:statusUpdated', (payload) => {
      if (payload.orderId === id) { // chỉ quan tâm đơn đang xem
        orderService.getOrderById(id).then(setOrder).catch(() => {}); // tải lại đơn; lỗi mạng thì giữ dữ liệu cũ
      }
    });
    return () => socket.disconnect(); // rời trang -> đóng kết nối
  }, [id]);

  const handleCancel = async () => {
    if (!confirm('Bạn chắc chắn muốn hủy đơn hàng này?')) return; // hỏi lại trước khi hủy
    // SỬA LỖI: trước đây không bắt lỗi -> backend từ chối (cửa hàng vừa chuẩn bị hàng, đơn vừa đổi...) thì khách
    // bấm nút không thấy gì xảy ra. Nay báo đúng lý do và tải lại đơn để thấy trạng thái mới nhất.
    try {
      const updated = await orderService.cancelOrder(id, 'Khách hàng yêu cầu hủy');
      setOrder(updated); // hiển thị trạng thái "Đã hủy"
    } catch (err) {
      alert(err.response?.data?.message || 'Không hủy được đơn hàng, vui lòng thử lại');
      orderService.getOrderById(id).then(setOrder).catch(() => {});
    }
  };

  const handleWarrantyRequest = async (e) => {
    e.preventDefault();
    try {
      const created = await warrantyService.createRequest({ orderId: id, ...warrantyForm }); // gửi yêu cầu bảo hành
      setWarrantyMsg({ ok: true, text: `Đã gửi yêu cầu bảo hành (mã phiếu ${created.ticketCode}). Vui lòng theo dõi trong mục "Bảo hành".` });
      setWarrantyForm({ productId: '', issueDescription: '' });
    } catch (err) {
      setWarrantyMsg({ ok: false, text: err.response?.data?.message || 'Có lỗi xảy ra' });
    }
    loadOpenWarranties();
  };

  if (loadError)
    return (
      <div className="text-center py-5">
        <div className="fs-1 mb-2">📦</div>
        <div className="fw-semibold mb-1">{loadError}</div>
        <div className="small text-muted mb-3">Đơn có thể đã bị xóa khỏi hệ thống hoặc đường dẫn không đúng.</div>
        <Link to="/account/orders" className="btn btn-primary btn-sm">
          Xem danh sách đơn hàng
        </Link>
      </div>
    );
  if (!order)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  const statusSteps = order.deliveryMethod === 'store_pickup' ? ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'delivered'] : homeSteps;
  const currentStepIndex = statusSteps.indexOf(order.status);

  return (
    <Container className="py-4" style={{ maxWidth: '48rem' }}>
      {location.state?.justPlaced && (
        <Alert variant="success" className="mb-4">
          🎉 Đặt hàng thành công! Mã đơn hàng của bạn là <strong>{order.orderCode}</strong>
        </Alert>
      )}

      <h1 className="fs-4 fw-bold mb-1">Đơn hàng #{order.orderCode}</h1>
      <p>{orderMethod(order)}</p>
      {order.status === 'ready_for_pickup' && <Alert variant="info">Hàng đã sẵn sàng. Vui lòng mang mã đơn đến cửa hàng để nhận.</Alert>}
      {order.status === 'returning' && <Alert variant="warning">Đơn đang chờ cửa hàng nhận lại hàng.</Alert>}
      {order.express?.deadline && !['cancelled', 'returned'].includes(order.status) && (
        <Alert variant={order.status === 'delivered' ? 'success' : 'warning'} className="d-flex align-items-center gap-2">
          <span className="fs-4">⚡</span>
          <span>
            <b>Đơn giao hỏa tốc</b> (phụ phí {(order.express.fee || 0).toLocaleString('vi-VN')}đ) ·{' '}
            {order.status === 'delivered'
              ? 'Đã giao lúc ' + new Date(order.express.deliveredAt || order.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
              : 'Cam kết giao trước ' + new Date(order.express.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' hôm nay. Shipper sẽ gọi cho bạn trước khi tới.'}
          </span>
        </Alert>
      )}
      {order.status === 'delivered' && <OrderEInvoice orderId={order._id} />}
      {order.refundStatus === 'pending' && <Alert variant="warning">Đang chờ hoàn tiền. Cửa hàng sẽ cập nhật sau khi hoàn tiền thực tế.</Alert>}
      <p className="small text-muted mb-1">Đặt lúc <b>{orderDateTime(order.createdAt)}</b> ({timeAgo(order.createdAt)})</p>
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
        {['pending', 'processing'].includes(order.refundStatus) && (
          <span className="badge text-bg-warning">Đang chờ hoàn tiền {(order.grandTotal || 0).toLocaleString('vi-VN')}đ</span>
        )}
        {order.refundStatus === 'completed' && order.refundedAt && (
          <span className="text-success">
            Đã hoàn {(order.refundInfo?.amount ?? order.grandTotal ?? 0).toLocaleString('vi-VN')}đ
            {order.refundInfo?.method === 'gateway' ? ` về ${order.refundInfo.gateway === 'vnpay' ? 'VNPay' : 'MoMo'}` : ''} ngày {new Date(order.refundedAt).toLocaleDateString('vi-VN')}
            {order.refundInfo?.method === 'gateway' && ' (tiền về tài khoản / thẻ tùy ngân hàng, thường 1-7 ngày làm việc)'}
          </span>
        )}
        {PAYMENT_GATEWAYS[order.paymentMode] &&
          !['paid', 'refunded'].includes(order.paymentStatus) &&
          !['cancelled', 'returned', 'returning'].includes(order.status) && (
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

      {!['cancelled', 'returned', 'returning'].includes(order.status) && (
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
              <div className="mt-1">{s === 'delivered' && order.deliveryMethod === 'store_pickup' ? 'Đã bàn giao' : statusLabel[s]}</div>
            </div>
          ))}
        </div>
      )}
      {order.status === 'cancelled' && (
        <Alert variant="danger" className="mb-4 small">
          Đơn hàng đã bị hủy: {order.cancelReason}
        </Alert>
      )}

      <ListGroup className="mb-4" id="review">
        {order.items.map((item, idx) => (
          <ListGroup.Item key={idx} className="d-flex justify-content-between small">
            <span>
              {item.name}
              {item.variantLabel && <span className="text-muted"> ({item.variantLabel})</span>} x{item.quantity}
              {order.status === 'delivered' && <OrderReviewButton order={order} item={item} />}
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
          {/* Đơn mới: tách khuyến mãi tự động và mã giảm giá; đơn cũ chỉ có tổng giảm giá */}
          {(order.promotions || []).map((p) => (
            <div key={p.promotionId || p.name} className="d-flex justify-content-between text-success">
              <span>Khuyến mãi: {p.name}</span>
              <span>-{formatVND(p.amount)}</span>
            </div>
          ))}
          {order.discountAmount - (order.promotionDiscount || 0) > 0 && (
            <div className="d-flex justify-content-between text-success">
              <span>{order.voucherCode ? `Mã giảm giá ${order.voucherCode}` : 'Giảm giá'}</span>
              <span>-{formatVND(order.discountAmount - (order.promotionDiscount || 0))}</span>
            </div>
          )}
          <div className="d-flex justify-content-between fw-bold border-top pt-2 mt-2">
            <span>Tổng cộng</span>
            <span className="text-primary">{formatVND(order.grandTotal)}</span>
          </div>
          <VatBreakdown vat={order.vat} shippingVat={order.shippingVat} shippingFee={order.shippingFee} />
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

      {order.invoiceInfo?.taxCode && (
        <div className="small mb-4 border rounded-3 p-3">
          <div className="fw-medium mb-1">Thông tin xuất hóa đơn công ty</div>
          <div>{order.invoiceInfo.companyName}</div>
          <div>Mã số thuế: {order.invoiceInfo.taxCode}</div>
          <div>Địa chỉ: {order.invoiceInfo.address}</div>
          {order.invoiceInfo.email && <div>Email nhận hóa đơn: {order.invoiceInfo.email}</div>}
          <div className="text-muted mt-1">Hóa đơn điện tử sẽ được gửi sau khi đơn hàng hoàn tất.</div>
        </div>
      )}

      {order.activeTransferId && <Alert variant="info">Đơn đang được điều phối sang chi nhánh khác. Bạn có thể tiếp tục thao tác sau khi điều phối hoàn tất.</Alert>}
      <ShipmentTracking order={order} onChanged={() => orderService.getOrderById(id).then(setOrder)} />
      {!order.activeTransferId && !['creating', 'unknown', 'active'].includes(order.shipment?.phase) && ['pending', 'confirmed'].includes(order.status) && (
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
