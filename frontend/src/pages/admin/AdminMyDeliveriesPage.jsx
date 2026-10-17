import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Modal } from 'react-bootstrap';
import api from '../../services/api';

// Nhân viên giao hàng (quyền deliveries.perform): đơn được phân công cho mình (UC38), xác nhận lấy hàng, báo kết
// quả giao (UC39), xem tiền COD đang giữ chờ nộp về chi nhánh (UC40).
const money = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const STATUS = { confirmed: 'Chi nhánh đang chuẩn bị', processing: 'Chờ lấy hàng', shipping: 'Đang giao' };
const REASONS = ['Không liên lạc được khách', 'Khách hẹn giao hôm khác', 'Sai địa chỉ', 'Khách từ chối nhận hàng'];

export default function AdminMyDeliveriesPage() {
  const [data, setData] = useState({ active: [], codPending: [], codTotal: 0 });
  const [error, setError] = useState('');
  const [failing, setFailing] = useState(null); // đơn đang báo giao thất bại
  const [reason, setReason] = useState(REASONS[0]);
  const [refused, setRefused] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await api.get('/deliveries/mine')).data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh sách');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (action) => {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác không thành công');
    }
    load();
  };
  const pickUp = (o) => run(() => api.post(`/deliveries/${o._id}/pickup`));
  const success = (o) => {
    const cod = o.paymentMode === 'cod' ? ` và đã thu ${money(o.grandTotal)}` : '';
    if (window.confirm(`Xác nhận đã giao đơn ${o.orderCode}${cod}?`)) run(() => api.post(`/deliveries/${o._id}/result`, { result: 'success' }));
  };
  const openFail = (o) => {
    setFailing(o);
    setReason(REASONS[0]);
    setRefused(false);
  };
  const submitFail = () => {
    const o = failing;
    setFailing(null);
    run(() => api.post(`/deliveries/${o._id}/result`, { result: 'failed', reason, refused: refused || reason === 'Khách từ chối nhận hàng' }));
  };

  return (
    <div>
      <h3 className="mb-3">Đơn tôi cần giao</h3>
      {error && <Alert variant="danger">{error}</Alert>}
      {data.codTotal > 0 && (
        <Alert variant="warning">
          Bạn đang giữ <strong>{money(data.codTotal)}</strong> tiền thu hộ (COD) của {data.codPending.length} đơn - hãy nộp về chi nhánh để quản lý xác nhận.
        </Alert>
      )}

      {data.active.length === 0 && <p className="text-muted">Chưa có đơn nào được phân công cho bạn.</p>}
      <div className="d-grid gap-3" style={{ maxWidth: 720 }}>
        {data.active.map((o) => (
          <Card key={o._id}>
            <Card.Body>
              <div className="d-flex justify-content-between flex-wrap gap-2">
                <strong>{o.orderCode}</strong>
                <Badge bg={o.status === 'shipping' ? 'primary' : 'secondary'}>{STATUS[o.status] || o.status}</Badge>
              </div>
              <div className="mt-2">
                {o.deliveryAddress?.fullName} - <a href={`tel:${o.deliveryAddress?.phone}`}>{o.deliveryAddress?.phone}</a>
              </div>
              <div className="small text-muted">
                {[o.deliveryAddress?.addressLine1, o.deliveryAddress?.addressLine2, o.deliveryAddress?.city].filter(Boolean).join(', ')}
              </div>
              <div className="small mt-1">
                Lấy hàng tại: {o.storeId?.name} - {o.storeId?.address}
              </div>
              <div className="mt-2">
                {o.paymentMode === 'cod' ? (
                  <>Thu hộ: <strong>{money(o.grandTotal)}</strong></>
                ) : (
                  <span className="text-success">Đã thanh toán online - không thu tiền</span>
                )}
              </div>
              <ul className="small mb-2 mt-2">
                {o.items.map((i, k) => (
                  <li key={k}>
                    {i.name} ({i.variantLabel}) x {i.quantity}
                  </li>
                ))}
              </ul>
              {o.deliveryAttempts?.length > 0 && (
                <div className="small text-danger mb-2">
                  Đã giao không thành công {o.deliveryAttempts.filter((a) => a.result === 'failed').length} lần:{' '}
                  {o.deliveryAttempts.map((a) => a.reason).filter(Boolean).join('; ')}
                </div>
              )}
              <div className="d-flex gap-2">
                {o.status === 'processing' && <Button onClick={() => pickUp(o)}>Đã lấy hàng</Button>}
                {o.status === 'shipping' && (
                  <>
                    <Button variant="success" onClick={() => success(o)}>Giao thành công</Button>
                    <Button variant="outline-danger" onClick={() => openFail(o)}>Giao không thành công</Button>
                  </>
                )}
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>

      <Modal show={!!failing} onHide={() => setFailing(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Giao không thành công - {failing?.orderCode}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Lý do</Form.Label>
            <Form.Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Check
            type="checkbox"
            label="Khách từ chối nhận - mang hàng về chi nhánh (trả hàng)"
            checked={refused || reason === 'Khách từ chối nhận hàng'}
            disabled={reason === 'Khách từ chối nhận hàng'}
            onChange={(e) => setRefused(e.target.checked)}
          />
          <div className="small text-muted mt-2">Giao không thành công quá số lần cho phép thì đơn tự chuyển sang trả hàng.</div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setFailing(null)}>Hủy</Button>
          <Button variant="danger" onClick={submitFail}>Ghi nhận</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
