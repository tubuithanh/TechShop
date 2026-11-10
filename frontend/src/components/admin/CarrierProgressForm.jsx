import { useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import api from '../../services/api';
import { SHIPMENT_LABELS } from '../ShipmentTracking';

export default function CarrierProgressForm({ order, next, onSaved, onBusy }) {
  const [status, setStatus] = useState(next[0]);
  const [note, setNote] = useState(''), [files, setFiles] = useState([]), [ids, setIds] = useState([]);
  const [previews, setPreviews] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const needsImages = ['picked', 'delivered'].includes(status);
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f)); setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  const choose = e => {
    const selected = Array.from(e.target.files || []); e.target.value = '';
    const merged = [...files, ...selected];
    if (merged.length > 5 || selected.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024)) return setError('Tối đa 5 ảnh JPG/PNG/WEBP, mỗi ảnh tối đa 5MB');
    setFiles(merged); setIds([]); setError('');
  };
  const submit = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      let evidenceIds = ids;
      if (needsImages && !evidenceIds.length) {
        if (!files.length) throw new Error('Cần đính kèm ít nhất 1 ảnh bằng chứng');
        const body = new FormData(); files.forEach(f => body.append('images', f));
        const r = await api.post(`/deliveries/${order._id}/shipment/evidence/${status}`, body);
        evidenceIds = r.data.data.map(x => x._id); setIds(evidenceIds);
      }
      const r = await api.post(`/deliveries/${order._id}/shipment/advance`, { status, previousStatus: order.shipment.status, note, evidenceIds });
      onSaved(r.data.data);
    } catch (err) { setError(err.response?.data?.message || err.message); }
    finally { setBusy(false); onBusy(false); }
  };
  return <Form className="w-100 border rounded p-3" onSubmit={submit}>
    {error && <Alert variant="danger">{error}</Alert>}
    <Form.Label>Cập nhật giao hàng</Form.Label>
    <Form.Select disabled={busy} value={status} onChange={e => { setStatus(e.target.value); setFiles([]); setIds([]); }}>{next.map(s => <option key={s} value={s}>{SHIPMENT_LABELS[s]}</option>)}</Form.Select>
    <Form.Control className="mt-2" disabled={busy} placeholder="Ghi chú" required={['delivery_fail','returning'].includes(status)} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
    {needsImages && <div className="mt-3"><Form.Label>{status === 'picked' ? 'Ảnh nhận hàng từ shop' : 'Ảnh giao thành công'} * ({files.length}/5)</Form.Label>
      <Form.Control aria-label="Chọn ảnh bằng chứng" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || files.length >= 5} onChange={choose} />
      <Form.Text>Chọn 1–5 ảnh JPG/PNG/WEBP, tối đa 5MB mỗi ảnh.</Form.Text>
      <div className="d-flex gap-2 flex-wrap mt-2">{previews.map((url,i) => <div key={url}><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Ảnh ${i+1}`} style={{ width:120,height:100,objectFit:'cover' }} /></a><Button className="d-block mt-1" size="sm" variant="outline-danger" disabled={busy} onClick={() => { setFiles(files.filter((_,j)=>j!==i)); setIds([]); }}>Bỏ ảnh</Button></div>)}</div>
    </div>}
    <Button type="submit" className="mt-3" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận cập nhật'}</Button>
  </Form>;
}
