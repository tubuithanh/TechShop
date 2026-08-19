import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Container, Alert, ListGroup, Card, Button, Form, Spinner } from 'react-bootstrap';
import { orderService } from '../services/orderService';
import { warrantyService } from '../services/warrantyService';
import { io } from 'socket.io-client';
import { getAccessToken } from '../services/api';

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

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [warrantyForm, setWarrantyForm] = useState({ productId: '', issueDescription: '' });
  const [warrantyMsg, setWarrantyMsg] = useState('');

  useEffect(() => {
    orderService.getOrderById(id).then(setOrder);
  }, [id]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = io('/', { auth: { token } });
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
      await warrantyService.createRequest({ orderId: id, ...warrantyForm });
      setWarrantyMsg('Đã gửi yêu cầu bảo hành thành công! Vui lòng theo dõi trong mục "Bảo hành".');
    } catch (err) {
      setWarrantyMsg(err.response?.data?.message || 'Có lỗi xảy ra');
    }
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
              {item.name} x{item.quantity}
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
                <option key={item.productId} value={item.productId}>
                  {item.name}
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
          {warrantyMsg && <div className="small mt-2 text-success">{warrantyMsg}</div>}
        </div>
      )}
    </Container>
  );
}
