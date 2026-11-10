import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../../services/api';

export default function OrderTransfers({ order, onClose, onChanged }) {
  const [rows, setRows] = useState([]), [stores, setStores] = useState([]);
  const [form, setForm] = useState({ toStoreId: '', reason: '', customerConsent: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = () => api.get('/orders/admin/transfers').then(r => setRows(r.data.data)).catch(e => setError(e.response?.data?.message || 'Không tải được yêu cầu'));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    setForm({ toStoreId: '', reason: '', customerConsent: false }); setError('');
    if (order) api.get('/stores').then(r => setStores(r.data.data)).catch(() => setError('Không tải được chi nhánh'));
  }, [order]);
  const run = async (url, body) => {
    setBusy(true); setError('');
    try { await api.post(url, body); await load(); onChanged(); if (order) onClose(); }
    catch (e) { setError(e.response?.data?.message || 'Không lưu được'); }
    finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline-secondary" className="mb-2" disabled={busy} onClick={load}>Tải lại yêu cầu điều phối</Button>
    {error && !order && <Alert variant="danger">{error}</Alert>}
    {rows.length > 0 && <div className="border rounded p-3 mb-3"><h6>Yêu cầu điều phối đang chờ</h6><Table responsive size="sm"><thead><tr><th>Đơn</th><th>Từ → đến</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>{rows.map(t => <tr key={t._id}>
      <td>{t.orderId?.orderCode}<div className="small text-muted">{t.orderId?.items?.map(i => `${i.name} x${i.quantity}`).join(", ")}</div></td><td>{t.fromStoreId?.name} → {t.toStoreId?.name}</td><td>{t.reason}</td><td>
        {t.canDecide && ['accepted', 'rejected'].map(decision => <Button className="me-1" size="sm" key={decision} disabled={busy} onClick={() => { if (window.confirm(decision === 'accepted' ? 'Tiếp nhận đơn và chuyển giữ kho về chi nhánh này?' : 'Từ chối yêu cầu điều phối?')) run(`/orders/admin/transfers/${t._id}/decision`, { decision }); }}>{decision === 'accepted' ? 'Tiếp nhận' : 'Từ chối'}</Button>)}
        {t.canCancel && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => run(`/orders/admin/transfers/${t._id}/decision`, { decision: 'cancelled' })}>Hủy yêu cầu</Button>}
      </td></tr>)}</tbody></Table></div>}
    <Modal show={!!order} onHide={busy ? undefined : onClose}><Modal.Header closeButton><Modal.Title>Điều phối {order?.orderCode}</Modal.Title></Modal.Header><Modal.Body>
      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={e => { e.preventDefault(); run(`/orders/${order._id}/transfer`, form); }}>
        <Form.Label>Chi nhánh tiếp nhận</Form.Label><Form.Select required value={form.toStoreId} onChange={e => setForm({ ...form, toStoreId: e.target.value })}><option value="">Chọn chi nhánh</option>{stores.filter(s => s._id !== (order?.storeId?._id || order?.storeId)).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</Form.Select>
        <Form.Label className="mt-2">Lý do</Form.Label><Form.Control as="textarea" required maxLength={1000} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
        {order?.deliveryMethod === 'store_pickup' && <Form.Check className="mt-2" required label="Đã liên hệ và được khách đồng ý thay đổi cửa hàng nhận hàng" checked={form.customerConsent} onChange={e => setForm({ ...form, customerConsent: e.target.checked })} />}
        <p className="small text-muted mt-2">Chi nhánh đích cần xác nhận tiếp nhận và đủ tồn kho. Đơn tạm khóa xử lý trong lúc chờ.</p>
        <Button type="submit" disabled={busy}>Gửi yêu cầu</Button>
      </Form>
    </Modal.Body></Modal>
  </>;
}
