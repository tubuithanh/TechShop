import { useEffect, useId, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import api from '../../services/api';
import { money } from '../../utils/orderWorkflow';

export default function HandoverModal({ order, shipper = false, onHide, onDone }) {
  const [recipientName, setRecipientName] = useState(order.deliveryAddress?.fullName || '');
  const [differentRecipient, setDifferent] = useState(false);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const cameraId = useId();
  useEffect(() => {
    const next = files.map(file => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(item => URL.revokeObjectURL(item.url));
  }, [files]);
  const [ids, setIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const needsPayment = order.paymentStatus !== 'paid' || (shipper && order.paymentMode === 'cod');
  const other = differentRecipient || recipientName.trim() !== order.deliveryAddress?.fullName;
  const chooseFiles = e => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;
    const signature = f => `${f.name}:${f.size}:${f.lastModified}`;
    const merged = [...files];
    for (const file of selected) if (!merged.some(f => signature(f) === signature(file))) merged.push(file);
    if (merged.length > 5 || selected.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024)) {
      setError('Chọn 1–5 ảnh JPG/PNG/WEBP, mỗi ảnh tối đa 5MB'); e.target.value = ''; return;
    }
    setError(''); setFiles(merged); setIds([]);
  };
  const submit = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      let evidenceIds = ids;
      if (shipper && !evidenceIds.length) {
        if (!files.length) throw new Error('Cần ảnh chứng minh bàn giao');
        const body = new FormData(); files.forEach(f => body.append('images', f));
        const result = await api.post(`/deliveries/${order._id}/evidence`, body, { onUploadProgress: p => setProgress(p.total ? Math.round(p.loaded / p.total * 100) : 0) });
        evidenceIds = result.data.data.map(x => x._id); setIds(evidenceIds);
      }
      const payload = { recipientName: recipientName.trim(), differentRecipient: other, note, evidenceIds, paymentConfirmed: confirmed };
      await api.post(shipper ? `/deliveries/${order._id}/result` : `/orders/${order._id}/handover`, { ...payload, ...(shipper ? { result: 'success' } : {}) });
      onDone();
    } catch (err) { setError(err.response?.data?.message || err.message || 'Chưa hoàn tất, vui lòng thử lại'); }
    finally { setBusy(false); }
  };
  return <Modal show onHide={busy ? undefined : onHide} backdrop="static">
    <Form onSubmit={submit}>
      <Modal.Header closeButton={!busy}><Modal.Title>Xác nhận bàn giao — {order.orderCode}</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form.Group className="mb-3"><Form.Label>Người nhận thực tế *</Form.Label><Form.Control required maxLength={120} value={recipientName} disabled={busy} onChange={e => setRecipientName(e.target.value)} /></Form.Group>
        <Form.Check className="mb-3" label="Người nhận khác người đặt" checked={other} disabled={busy} onChange={e => setDifferent(e.target.checked)} />
        <Form.Group className="mb-3"><Form.Label>Ghi chú {other && '*'}</Form.Label><Form.Control as="textarea" rows={3} required={other} maxLength={1000} value={note} disabled={busy} onChange={e => setNote(e.target.value)} /></Form.Group>
        {shipper && <Form.Group className="mb-3">
          <Form.Label>Ảnh chứng minh bàn giao * ({files.length}/5)</Form.Label>
          <Form.Control aria-label="Chọn thêm ảnh bàn giao" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || files.length >= 5} onChange={chooseFiles} />
          <Form.Control id={cameraId} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || files.length >= 5} onChange={chooseFiles} />
          <label htmlFor={cameraId} className={`btn btn-outline-secondary btn-sm mt-2 ${busy || files.length >= 5 ? 'disabled' : ''}`}>Chụp thêm ảnh</label>
          <Form.Text className="d-block">Có thể chọn nhiều lần, tối đa 5 ảnh JPG/PNG/WEBP, 5MB/ảnh. Chụp kiện hàng tại điểm bàn giao, tránh mặt và giấy tờ cá nhân.</Form.Text>
          <div className="d-flex flex-wrap gap-2 mt-2">{previews.map(({ file, url }) => <div key={url} className="border rounded p-1" style={{ width: 125 }}>
            <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Xem trước ${file.name}`} style={{ width: '100%', height: 100, objectFit: 'cover' }} /></a>
            <div className="small text-truncate" title={file.name}>{file.name}</div>
            <Button variant="outline-danger" size="sm" disabled={busy} aria-label={`Bỏ ảnh ${file.name}`} onClick={() => { setFiles(files.filter(f => f !== file)); setIds([]); setError(''); }}>Bỏ ảnh</Button>
          </div>)}</div>
          <div className="small mt-1">{busy && files.length > 0 && `Tải ảnh ${progress}%`}{ids.length > 0 && ' · Đã tải ảnh'}</div>
        </Form.Group>}
        {needsPayment ? <Form.Check required disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} label={`Tôi đã thu đủ ${money(order.grandTotal)}${order.paymentMode === 'cod' && shipper ? ' tiền COD' : ''}`} /> : <Alert variant="success">Đã thanh toán — không thu thêm tiền</Alert>}
      </Modal.Body>
      <Modal.Footer><Button variant="secondary" disabled={busy} onClick={onHide}>Đóng</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận đã bàn giao'}</Button></Modal.Footer>
    </Form>
  </Modal>;
}
