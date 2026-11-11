import { useState } from 'react';
import { Modal, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import { Lightning, CashCoin } from 'react-bootstrap-icons';
import api from '../../services/api';

const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const GATEWAY = { vnpay: 'VNPay', momo: 'MoMo' };

// Hoàn tiền cho đơn đã thanh toán bị hủy / trả hàng.
//  - Đơn VNPay / MoMo: "Hoàn qua cổng thanh toán" gửi lệnh hoàn tiền tới VNPay / MoMo, tiền tự về thẻ / ví của khách.
//  - Mọi đơn: "Đã hoàn thủ công" (tiền mặt, chuyển khoản, hoàn trên trang merchant) - bắt buộc ghi chú.
export default function RefundModal({ order, onHide, onDone }) {
  const gateway = GATEWAY[order.paymentMode];
  const [method, setMethod] = useState(gateway ? 'gateway' : 'manual');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempts = order.refundInfo?.attempts || [];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post(`/orders/${order._id}/confirm-refund`, { confirmed: true, method, note });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Hoàn tiền thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show onHide={busy ? undefined : onHide} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!busy}><Modal.Title className="fs-5">Hoàn tiền đơn {order.orderCode}</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-between align-items-center mb-3 p-2 rounded-2 bg-body-tertiary">
            <span className="small">Số tiền hoàn ({gateway || 'thanh toán ' + order.paymentMode})</span>
            <span className="fs-5 fw-bold text-danger">{formatVND(order.grandTotal)}</span>
          </div>
          {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

          {gateway && (
            <Form.Check type="radio" id="rf-gateway" name="rf-method" className="mb-2" checked={method === 'gateway'} onChange={() => setMethod('gateway')}
              label={<>
                <span className="fw-medium"><Lightning className="text-warning" /> Hoàn qua {gateway} (tự động)</span>
                <div className="small text-muted">Gửi lệnh hoàn tiền tới {gateway}; tiền tự về thẻ / ví của khách (thường 1-7 ngày làm việc tùy ngân hàng).</div>
              </>} />
          )}
          <Form.Check type="radio" id="rf-manual" name="rf-method" checked={method === 'manual'} onChange={() => setMethod('manual')}
            label={<>
              <span className="fw-medium"><CashCoin className="text-success" /> Đã hoàn thủ công</span>
              <div className="small text-muted">Đã trả tiền mặt, chuyển khoản{gateway ? `, hoặc đã hoàn trên trang quản lý merchant ${gateway}` : ''} - chỉ ghi nhận.</div>
            </>} />

          <Form.Group className="mt-3">
            <Form.Label className="small fw-medium">{method === 'manual' ? 'Ghi chú / mã giao dịch hoàn tiền *' : 'Ghi chú (tùy chọn)'}</Form.Label>
            <Form.Control as="textarea" rows={2} maxLength={1000} required={method === 'manual'} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={method === 'manual' ? 'VD: CK Vietcombank mã FT2611...' : 'VD: Khách hủy do đổi ý'} />
          </Form.Group>

          {attempts.length > 0 && (
            <div className="small mt-3">
              <div className="fw-medium mb-1">Các lần thử hoàn qua cổng trước đó</div>
              {attempts.map((a, i) => (
                <div key={i} className="d-flex gap-2 align-items-start">
                  <Badge bg={a.ok ? 'success' : 'danger'} className="fw-normal">{a.ok ? 'OK' : `Lỗi ${a.code}`}</Badge>
                  <span className="text-muted">{new Date(a.at).toLocaleString('vi-VN')} - {a.message}</span>
                </div>
              ))}
              <div className="text-muted mt-1">Nếu lần trước lỗi kết nối, hãy kiểm tra trên trang merchant xem đã hoàn chưa trước khi thử lại.</div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={onHide}>Đóng</Button>
          <Button type="submit" variant="warning" disabled={busy}>
            {busy ? <><Spinner size="sm" /> Đang hoàn tiền...</> : method === 'gateway' ? `Hoàn ${formatVND(order.grandTotal)} qua ${gateway}` : 'Xác nhận đã hoàn'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
