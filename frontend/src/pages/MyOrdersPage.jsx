import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Card, Badge, Spinner, Alert, Stack } from 'react-bootstrap';
import { orderService } from '../services/orderService';
import { orderLabel, orderMethod } from '../utils/orderWorkflow';

const statusLabel = {
  ready_for_pickup: 'Sẵn sàng nhận tại cửa hàng', returning: 'Chờ nhận hàng trả',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả'
};

const statusVariant = {
  ready_for_pickup: 'info', returning: 'warning',
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  shipping: 'primary',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'secondary'
};

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orderService.getMyOrders().then(setOrders).finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  return (
    <Container className="py-4" style={{ maxWidth: '48rem' }}>
      <h1 className="fs-4 fw-bold mb-4">Đơn hàng của tôi</h1>
      {orders.length === 0 ? (
        <Alert variant="light" className="border text-muted mb-0">
          Bạn chưa có đơn hàng nào.
        </Alert>
      ) : (
        <Stack gap={3}>
          {orders.map((o) => (
            <Card
              as={Link}
              key={o._id}
              to={`/account/orders/${o._id}`}
              className="text-decoration-none text-body shadow-sm"
            >
              <Card.Body>
                <div className="d-flex justify-content-between mb-1">
                  <span className="fw-medium">#{o.orderCode}</span>
                  <Badge bg={statusVariant[o.status] || 'secondary'}>{orderLabel(o)}</Badge>
                </div>
                <div className="small text-muted">
                  {o.items.length} sản phẩm · {orderMethod(o)} · {o.storeId?.name} · {new Date(o.createdAt).toLocaleDateString('vi-VN')}
                </div>
                <div className="text-primary fw-bold mt-1">{formatVND(o.grandTotal)}</div>
              </Card.Body>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
