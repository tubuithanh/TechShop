import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { FileEarmarkText, Send, PencilSquare } from 'react-bootstrap-icons';
import api from '../../services/api';
import EInvoiceView from '../EInvoiceView';

const FIELDS = [['name', 'Họ tên người mua', 6], ['phone', 'Số điện thoại', 6], ['companyName', 'Tên đơn vị (nếu xuất cho công ty)', 6], ['taxCode', 'Mã số thuế', 6], ['address', 'Địa chỉ', 12], ['email', 'Email nhận hóa đơn', 12]];

// XEM TRƯỚC hóa đơn (bản nháp chưa phát hành): kiểm tra nội dung, sửa thông tin người mua, rồi mới phát hành.
// onIssued(invoice) sau khi phát hành thành công
export default function EInvoiceDraftModal({ orderId, onHide, onIssued }) {
  const [draft, setDraft] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (override) => {
    setError('');
    try {
      const { data } = await api.post(`/einvoices/orders/${orderId}/preview`, override ? { buyer: override } : {});
      setDraft(data.data);
      if (!override) setBuyer(data.data.buyer);
    } catch (e) { setError(e.response?.data?.message || 'Không tải được bản xem trước'); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  const issue = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/einvoices/orders/${orderId}/issue`, { buyer, sendEmail });
      onIssued?.(data.data);
    } catch (e) { setError(e.response?.data?.message || 'Không phát hành được'); } finally { setBusy(false); }
  };
  const canIssue = draft && !draft.blocker && !draft.existing;

  return (
    <Modal show onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton><Modal.Title className="fs-5"><FileEarmarkText className="me-2" />Xem trước hóa đơn · đơn {draft?.orderCode}</Modal.Title></Modal.Header>
      <Modal.Body className="bg-body-tertiary">
        {error && <Alert variant="danger">{error}</Alert>}
        {draft?.blocker && <Alert variant="warning" className="py-2">Chưa phát hành được: <b>{draft.blocker}</b>. Bạn vẫn xem được nội dung hóa đơn dự kiến bên dưới.</Alert>}
        {draft?.existing && <Alert variant="info" className="py-2">Đơn này đã có hóa đơn số <b>{String(draft.existing.number).padStart(8, '0')}</b>. Muốn sửa, hãy dùng "Thay thế" trên hóa đơn đó.</Alert>}
        {editing && buyer && (
          <div className="border rounded-3 p-3 mb-3 bg-body">
            <div className="fw-semibold mb-2">Thông tin người mua trên hóa đơn</div>
            <Row className="g-2">
              {FIELDS.map(([k, label, md]) => (
                <Col md={md} key={k}><Form.Label className="small mb-0">{label}</Form.Label><Form.Control size="sm" value={buyer[k] || ''} onChange={(e) => setBuyer({ ...buyer, [k]: e.target.value })} /></Col>
              ))}
            </Row>
            <Button size="sm" className="mt-2" onClick={() => { load(buyer); setEditing(false); }}>Cập nhật bản xem trước</Button>
          </div>
        )}
        {!draft ? <div className="text-center p-5"><Spinner /></div> : <EInvoiceView inv={draft} />}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <Button variant="outline-secondary" disabled={!draft || !!draft.existing} onClick={() => setEditing((v) => !v)}><PencilSquare className="me-1" />{editing ? 'Ẩn sửa thông tin' : 'Sửa thông tin người mua'}</Button>
          <Form.Check id="draft-email" type="switch" label={`Gửi email cho khách${buyer?.email ? ` (${buyer.email})` : ' (chưa có email)'}`} checked={sendEmail && !!buyer?.email} disabled={!buyer?.email} onChange={(e) => setSendEmail(e.target.checked)} />
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={onHide}>Đóng</Button>
          <Button variant="success" size="lg" disabled={!canIssue || busy || editing} onClick={issue}><Send className="me-2" />{busy ? 'Đang phát hành…' : 'Phát hành hóa đơn'}</Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
