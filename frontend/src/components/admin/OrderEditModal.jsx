import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import api from '../../services/api';
export default function OrderEditModal({ order, onClose, onChanged }) {
  const [form, setForm] = useState({ deliveryAddress: { fullName: order.deliveryAddress?.fullName || '', phone: order.deliveryAddress?.phone || '' }, note: order.note || '', reason: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.put(`/orders/${order._id}/info`, form); onChanged(); onClose(); }
    catch (err) { setError(err.response?.data?.message || 'Không lưu được'); }
    finally { setBusy(false); }
  };
  return <Modal show onHide={busy ? undefined : onClose}><Modal.Header closeButton><Modal.Title>Sửa thông tin {order.orderCode}</Modal.Title></Modal.Header><Modal.Body>
    {error && <Alert variant="danger">{error}</Alert>}<Form onSubmit={submit}>
      {[['fullName','Người nhận',120], ['phone','Số điện thoại',20]].map(([key,label,max]) => <Form.Group className="mb-2" key={key}><Form.Label>{label}</Form.Label><Form.Control required maxLength={max} value={form.deliveryAddress[key]} onChange={e => setForm({ ...form, deliveryAddress: { ...form.deliveryAddress, [key]: e.target.value } })} /></Form.Group>)}
      <Form.Label>Ghi chú đơn hàng</Form.Label><Form.Control as="textarea" maxLength={1000} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
      <Form.Label>Lý do sửa</Form.Label><Form.Control required maxLength={1000} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
      <Button className="mt-3" type="submit" disabled={busy}>Lưu và ghi lịch sử</Button>
    </Form>
  </Modal.Body></Modal>;
}
