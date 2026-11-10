import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Card, Badge, Spinner, Alert, Stack, Button } from 'react-bootstrap';
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
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ counts: {}, totalPages: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    orderService.getMyOrdersPage({ page, status, limit: 10 }).then(r => {
      if (live) {
        setOrders(r.data); setMeta(r);
        if (page > Math.max(1, r.totalPages)) setPage(Math.max(1, r.totalPages));
      }
    }).catch(e => { if (live) { setOrders([]); setError(e.response?.data?.message || 'Không tải được đơn hàng'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, status]);

  return (
    <Container className="py-4" style={{ maxWidth: '48rem' }}>
      <h1 className="fs-4 fw-bold mb-4">Đơn hàng của tôi</h1>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {[['', 'Tất cả'], ...Object.entries(statusLabel)].map(([key, label]) => <Button key={key} size="sm" variant={status === key ? 'primary' : 'outline-primary'} onClick={() => { setStatus(key); setPage(1); }}>{label} ({key ? meta.counts[key] || 0 : Object.values(meta.counts).reduce((a,b) => a+b,0)})</Button>)}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <Spinner animation="border" /> : error ? <Button onClick={() => window.location.reload()}>Thử lại</Button> : orders.length === 0 ? (
        <Alert variant="light" className="border text-muted mb-0">
          {status ? 'Không có đơn hàng ở trạng thái này.' : 'Bạn chưa có đơn hàng nào.'}
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
      <div className="d-flex gap-3 align-items-center mt-3">
        <Button disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
        <span>Trang {page} / {Math.max(1, meta.totalPages)} · {meta.total || 0} đơn</span>
        <Button disabled={loading || page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Sau</Button>
      </div>
    </Container>
  );
}
