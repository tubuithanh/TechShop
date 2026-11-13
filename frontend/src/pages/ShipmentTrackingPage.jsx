import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Container, Spinner } from 'react-bootstrap';
import api from '../services/api';
import { SHIPMENT_LABELS } from '../components/ShipmentTracking';

function TrackingPhoto({ photo }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(false);
  useEffect(() => {
    let live = true, objectUrl;
    api.get(photo.url, { responseType: 'blob' }).then(r => {
      objectUrl = URL.createObjectURL(r.data);
      if (live) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => live && setError(true));
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.url]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={photo.stage === 'picked' ? 'Bằng chứng nhận hàng' : 'Bằng chứng giao thành công'} className="rounded border" style={{ width: 150, height: 120, objectFit: 'cover' }} /></a> : <span className="small text-muted">{error ? 'Không tải được ảnh' : 'Đang tải ảnh…'}</span>;
}

export default function ShipmentTrackingPage() {
  const { code } = useParams();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true, loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const r = await api.get(`/deliveries/track/${encodeURIComponent(code)}`);
        if (live) { setData(r.data.data); setError(''); }
      } catch (e) { if (live) setError(e.response?.data?.message || 'Chưa tải được vận đơn. Vui lòng thử lại.'); }
      finally { loading = false; if (live) setBusy(false); }
    };
    setData(null); setBusy(true); load();
    const timer = setInterval(load, 15000);
    return () => { live = false; clearInterval(timer); };
  }, [code, reload]);
  return <main className="min-vh-100 bg-light py-5"><Container style={{ maxWidth: 850 }}>
    <div className="d-flex align-items-center justify-content-between mb-3"><h1 className="h3 mb-0">Theo dõi giao hàng</h1><Badge bg="warning" text="dark">{data?.environment === 'sandbox' ? 'GHN · môi trường thử nghiệm' : 'GHN giả lập'}</Badge></div>
    <Alert variant="info">{data?.environment === 'sandbox'
      ? 'Vận đơn tạo trên môi trường thử nghiệm của Giao Hàng Nhanh - trạng thái được TechShop đồng bộ từ GHN mỗi phút.'
      : 'Trang mô phỏng vận chuyển của TechShop, không phải website GHN chính thức. Không có giao nhận hoặc thu tiền thật qua trang này.'}</Alert>
    {busy && <Spinner animation="border" role="status"><span className="visually-hidden">Đang tải</span></Spinner>}
    {error && <Alert variant="danger">{error}</Alert>}
    {data && <Card className="shadow-sm"><Card.Body>
      <div className="text-muted">Mã vận đơn</div><h2 className="h5 text-break">{data.code}</h2>
      <p className="h4 my-4">{SHIPMENT_LABELS[data.status] || data.status}</p>
      {data.destination && <p>Nơi đến: {data.destination}</p>}
      {!['delivered', 'returned', 'cancel', 'returning'].includes(data.status) && data.expectedDeliveryTime && <p>Dự kiến giao: {new Date(data.expectedDeliveryTime).toLocaleDateString('vi-VN')} (ước tính)</p>}
      <h3 className="h6 mt-4">Lịch sử vận chuyển</h3>
      <ol className="ps-4 mb-0">{[...(data.events || [])].reverse().map((event, i) => <li className="py-2 border-bottom" key={`${event.at}-${i}`}>
        <strong>{SHIPMENT_LABELS[event.status] || event.status}</strong><div className="small text-muted">{new Date(event.at).toLocaleString('vi-VN')}</div>
      </li>)}</ol>
      <h3 className="h6 mt-4">Ảnh giao nhận</h3>
      {!data.photos?.length && <p className="small text-muted">Chưa có ảnh bằng chứng được cập nhật.</p>}
      {['picked', 'delivered'].map(stage => data.photos?.some(p => p.stage === stage) && <section className="mt-3" key={stage}>
        <h4 className="h6 text-muted">{stage === 'picked' ? 'Nhận hàng từ shop' : 'Giao hàng thành công'}</h4>
        <div className="d-flex flex-wrap gap-2">{data.photos.filter(p => p.stage === stage).map(photo => <TrackingPhoto key={photo.url} photo={photo} />)}</div>
      </section>)}
      {data.photos?.length > 0 && <p className="small text-muted mt-2 mb-0">Bấm vào ảnh để xem đầy đủ.</p>}
    </Card.Body></Card>}
    <div className="mt-3 d-flex gap-3 align-items-center"><Button disabled={busy} onClick={() => setReload(n => n + 1)}>Làm mới</Button><span className="small text-muted">Tự cập nhật mỗi 15 giây</span></div>
    <a className="d-inline-block mt-4" href="/">Về TechShop</a>
  </Container></main>;
}
