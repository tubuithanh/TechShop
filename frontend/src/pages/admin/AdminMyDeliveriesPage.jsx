import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Modal, Nav } from 'react-bootstrap';
import HandoverModal from '../../components/admin/HandoverModal';
import OrderReceipt from '../../components/admin/OrderReceipt';
import { orderLabel } from '../../utils/orderWorkflow';
import api from '../../services/api';

// Nhân viên giao hàng (quyền deliveries.perform): đơn được phân công cho mình (UC38), xác nhận lấy hàng, báo kết
// quả giao (UC39), xem tiền COD đang giữ chờ nộp về chi nhánh (UC40).
const money = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const STATUS = { confirmed: 'Chi nhánh đang chuẩn bị', processing: 'Chờ lấy hàng', shipping: 'Đang giao' };
const REASONS = ['Không liên lạc được khách', 'Khách hẹn giao hôm khác', 'Sai địa chỉ', 'Khách từ chối nhận hàng'];

export default function AdminMyDeliveriesPage() {
  const [handover, setHandover] = useState(null);
  const [details, setDetails] = useState(null);
  const [view, setView] = useState('active');
  const [busy, setBusy] = useState(false);
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
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác không thành công');
    }
    load();
    setBusy(false);
  };
  const pickUp = (o) => run(() => api.post(`/deliveries/${o._id}/pickup`));
  const success = o => setHandover(o);
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
      <p className="text-muted">Chi nhánh đang giao: <strong>{data.branch?.name || 'Chưa được gán chi nhánh'}</strong></p>
      <Nav variant="tabs" activeKey={view} onSelect={setView} className="mb-3"><Nav.Item><Nav.Link eventKey="active">Cần xử lý</Nav.Link></Nav.Item><Nav.Item><Nav.Link eventKey="history">Lịch sử (50 đơn gần nhất)</Nav.Link></Nav.Item></Nav>
      {error && <Alert variant="danger">{error}</Alert>}
      {data.codTotal > 0 && (
        <Alert variant="warning">
          Bạn đang giữ <strong>{money(data.codTotal)}</strong> tiền thu hộ (COD) của {data.codPending.length} đơn - hãy nộp về chi nhánh để quản lý xác nhận.
        </Alert>
      )}

      {view === 'active' && data.active.length === 0 && <p className="text-muted">Chưa có đơn nào được phân công cho bạn.</p>}
      <div className="d-grid gap-3" style={{ maxWidth: 720 }}>
        {(view === 'active' ? data.active : data.history || []).map((o) => (
          <Card key={o._id}>
            <Card.Body>
              <div className="d-flex justify-content-between flex-wrap gap-2">
                <strong>{o.orderCode}</strong>
                {o.deliveryPlan?.mode === 'express' && <Badge bg="danger" className="ms-2">Hỏa tốc</Badge>}
                <Badge bg={o.status === 'shipping' ? 'primary' : 'secondary'}>{STATUS[o.status] || orderLabel(o)}</Badge>
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
                  <span className={o.paymentStatus === 'paid' ? 'text-success' : 'text-warning'}>{o.paymentStatus === 'paid' ? 'Đã thanh toán - không thu tiền' : 'Chờ cửa hàng xác nhận thanh toán'}</span>
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
                {o.status === 'processing' && <Button disabled={busy} onClick={() => pickUp(o)}>Đã lấy hàng</Button>}
                {o.status === 'shipping' && (
                  <>
                    <Button disabled={busy} variant="success" onClick={() => success(o)}>Giao thành công</Button>
                    <Button disabled={busy} variant="outline-danger" onClick={() => openFail(o)}>Giao không thành công</Button>
                  </>
                )}
                {o.status === 'returning' && <Alert variant="warning">Mang hàng về chi nhánh để nhân viên xác nhận nhận lại.</Alert>}
                {view === 'history' && <Button variant="outline-secondary" onClick={() => setDetails(o)}>Xem bàn giao</Button>}
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
      {handover && <HandoverModal key={handover._id} order={handover} shipper onHide={() => setHandover(null)} onDone={() => { setHandover(null); load(); }} />}
      {details && <OrderReceipt order={details} onHide={() => setDetails(null)} />}
    </div>
  );
}
