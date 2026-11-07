import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import api from '../../services/api';
export default function CreateCounterWarranty({ onHide, onDone }) {
  const [code, setCode] = useState(''), [order, setOrder] = useState(null), [productId, setProduct] = useState(''), [issue, setIssue] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const search = async () => {
    setBusy(true); setError(''); setOrder(null);
    try { const r = await api.get('/warranties/admin/order', { params: { code } }); setOrder(r.data.data); setProduct(r.data.data.items[0]?.productId || ''); }
    catch (err) { setError(err.response?.data?.message || 'Không tra được đơn'); } finally { setBusy(false); }
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/warranties', { orderId: order._id, productId, issueDescription: issue, method: 'bring_to_store' }); onDone(); }
    catch (err) { setError(err.response?.data?.message || 'Không tạo được phiếu'); } finally { setBusy(false); }
  };
  return <Modal show onHide={busy ? undefined : onHide}><Modal.Header closeButton={!busy}><Modal.Title>Tiếp nhận bảo hành tại cửa hàng</Modal.Title></Modal.Header><Form onSubmit={save}><Modal.Body>
    {error && <Alert variant="danger">{error}</Alert>}
    <Form.Label>Mã đơn hàng</Form.Label><div className="d-flex gap-2"><Form.Control value={code} disabled={busy} onChange={e => { setCode(e.target.value); setOrder(null); }} /><Button type="button" disabled={busy || !code.trim()} onClick={search}>Tra cứu</Button></div>
    {order && <><p className="mt-2">{order.deliveryAddress?.fullName} · {order.deliveryAddress?.phone}</p><Form.Label>Sản phẩm</Form.Label><Form.Select value={productId} disabled={busy} onChange={e => setProduct(e.target.value)}>{order.items.map((i,k) => <option key={k} value={i.productId}>{i.name} · {i.variantLabel}</option>)}</Form.Select><Form.Label className="mt-2">Mô tả lỗi *</Form.Label><Form.Control as="textarea" required maxLength={2000} value={issue} disabled={busy} onChange={e => setIssue(e.target.value)} /></>}
  </Modal.Body><Modal.Footer><Button variant="secondary" disabled={busy} onClick={onHide}>Đóng</Button><Button type="submit" disabled={busy || !order}>Tạo phiếu</Button></Modal.Footer></Form></Modal>;
}
