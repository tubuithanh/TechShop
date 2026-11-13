import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Col, Form, InputGroup, Modal, Nav, Row, Spinner, Alert } from 'react-bootstrap';
import { LightningChargeFill, Plus, Search, XLg, StopCircle, Clock, GeoAlt, BoxSeam } from 'react-bootstrap-icons';
import api from '../../services/api';
import { storeService } from '../../services/storeService';
import { productService } from '../../services/productService';
import { useAuth } from '../../store/AuthContext';
import AdminThumb from '../../components/admin/AdminThumb';

const vnd = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const hhmm = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
// <input type="datetime-local"> dùng giờ địa phương
const local = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const todayAt = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };

function status(w) {
  const now = Date.now();
  if (!w.isActive || new Date(w.endAt) <= now) return ['ended', 'Đã kết thúc', 'secondary'];
  if (new Date(w.startAt) > now) return ['upcoming', 'Sắp mở', 'info'];
  if (w.maxOrders && w.ordersCount >= w.maxOrders) return ['full', 'Hết suất', 'warning'];
  return ['open', 'Đang mở', 'success'];
}

function WindowModal({ show, onHide, onSaved, stores, scopedStore }) {
  const [form, setForm] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    const end = new Date(Math.max(todayAt(19).getTime(), Date.now() + 2 * 3600000));
    setForm({ storeId: scopedStore || '', title: 'Giao hỏa tốc 2 giờ', startAt: local(new Date()), endAt: local(end), radiusKm: 10, fee: 30000, slaMinutes: 120, maxOrders: 0, note: '' });
    setPicked([]); setQ(''); setError('');
  }, [show, scopedStore]);
  useEffect(() => {
    if (!show || q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => productService.getProducts({ q, limit: 12 }).then((r) => setResults(r.data || r.products || [])).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [q, show]);

  if (!form) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const preset = (fromNow, endHour) => setForm({ ...form, startAt: local(new Date()), endAt: local(endHour ? todayAt(endHour) : new Date(Date.now() + fromNow * 3600000)) });
  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.post('/express/admin', { ...form, startAt: new Date(form.startAt), endAt: new Date(form.endAt), radiusKm: Number(form.radiusKm), fee: Number(form.fee), slaMinutes: Number(form.slaMinutes), maxOrders: Number(form.maxOrders), productIds: picked.map((p) => p._id) });
      onSaved(); onHide();
    } catch (err) { setError(err.response?.data?.message || 'Không mở được khung giờ'); } finally { setSaving(false); }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton><Modal.Title className="fs-5"><LightningChargeFill className="text-warning me-2" />Mở khung giờ giao hỏa tốc</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
        <Row className="g-3">
          <Col md={6}>
            <Form.Label className="small fw-medium">Chi nhánh</Form.Label>
            <Form.Select size="sm" value={form.storeId} disabled={Boolean(scopedStore)} onChange={set('storeId')}>
              <option value="">Chọn chi nhánh</option>
              {stores.map((s) => <option key={s._id} value={s._id}>{s.name}{!Number.isFinite(s.lat) ? ' (chưa có tọa độ)' : ''}</option>)}
            </Form.Select>
          </Col>
          <Col md={6}><Form.Label className="small fw-medium">Tên hiển thị</Form.Label><Form.Control size="sm" value={form.title} maxLength={120} onChange={set('title')} /></Col>
          <Col md={12}>
            <div className="d-flex flex-wrap align-items-end gap-2">
              <div><Form.Label className="small fw-medium">Bắt đầu</Form.Label><Form.Control size="sm" type="datetime-local" value={form.startAt} onChange={set('startAt')} /></div>
              <div><Form.Label className="small fw-medium">Kết thúc</Form.Label><Form.Control size="sm" type="datetime-local" value={form.endAt} onChange={set('endAt')} /></div>
              <div className="btn-group btn-group-sm">
                <Button variant="outline-secondary" onClick={() => preset(2)}>2 giờ tới</Button>
                <Button variant="outline-secondary" onClick={() => preset(4)}>4 giờ tới</Button>
                <Button variant="outline-secondary" onClick={() => preset(0, 19)}>Đến 19:00</Button>
              </div>
            </div>
          </Col>
          <Col md={6}>
            <Form.Label className="small fw-medium">Bán kính giao: <b>{form.radiusKm} km</b></Form.Label>
            <Form.Range min={1} max={20} value={form.radiusKm} onChange={set('radiusKm')} />
          </Col>
          <Col md={3}><Form.Label className="small fw-medium">Phụ phí hỏa tốc</Form.Label><InputGroup size="sm"><Form.Control type="number" min={0} step={5000} value={form.fee} onChange={set('fee')} /><InputGroup.Text>đ</InputGroup.Text></InputGroup></Col>
          <Col md={3}><Form.Label className="small fw-medium">Cam kết giao trong</Form.Label><Form.Select size="sm" value={form.slaMinutes} onChange={set('slaMinutes')}>{[60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} phút</option>)}</Form.Select></Col>
          <Col md={6}><Form.Label className="small fw-medium">Số đơn tối đa <span className="text-muted fw-normal">(0 = không giới hạn; nên = số shipper × 3)</span></Form.Label><Form.Control size="sm" type="number" min={0} value={form.maxOrders} onChange={set('maxOrders')} /></Col>
          <Col md={6}><Form.Label className="small fw-medium">Ghi chú nội bộ</Form.Label><Form.Control size="sm" value={form.note} maxLength={300} onChange={set('note')} /></Col>
          <Col md={12}>
            <Form.Label className="small fw-medium">Sản phẩm giao hỏa tốc ({picked.length})</Form.Label>
            <InputGroup size="sm"><InputGroup.Text><Search /></InputGroup.Text><Form.Control placeholder="Tìm sản phẩm (gõ ít nhất 2 ký tự)" value={q} onChange={(e) => setQ(e.target.value)} /></InputGroup>
            {results.length > 0 && (
              <div className="border rounded mt-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {results.map((p) => {
                  const on = picked.some((x) => x._id === p._id);
                  return (
                    <div key={p._id} role="button" className={`d-flex align-items-center gap-2 px-2 py-1 border-bottom small ${on ? 'bg-success-subtle' : ''}`} onClick={() => setPicked(on ? picked.filter((x) => x._id !== p._id) : [...picked, p])}>
                      <AdminThumb src={p.featuredImage} alt={p.title} size={28} /><span className="flex-grow-1">{p.title}</span>{on ? <Badge bg="success">Đã chọn</Badge> : <Plus />}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="d-flex flex-wrap gap-1 mt-2">
              {picked.map((p) => <Badge key={p._id} bg="light" text="dark" className="border fw-normal d-inline-flex align-items-center gap-1">{p.title}<XLg role="button" size={10} onClick={() => setPicked(picked.filter((x) => x._id !== p._id))} /></Badge>)}
            </div>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Hủy</Button>
        <Button variant="warning" disabled={saving || !form.storeId || !picked.length} onClick={save}><LightningChargeFill className="me-1" />{saving ? 'Đang mở…' : 'Mở khung giờ hỏa tốc'}</Button>
      </Modal.Footer>
    </Modal>
  );
}

// QUẢN LÝ GIAO HỎA TỐC: mở khung giờ trong ngày, chọn sản phẩm + bán kính + phụ phí; theo dõi đơn đã giao / trễ hạn
export default function AdminExpressPage() {
  const { user } = useAuth();
  const scopedStore = user?.role === 'staff' ? (user.storeId?._id || user.storeId || '') : '';
  const [tab, setTab] = useState('open');
  const [windows, setWindows] = useState(null);
  const [stores, setStores] = useState([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/express/admin', { params: { status: tab === 'all' ? undefined : tab } }).then((r) => setWindows(r.data.data)).catch((e) => setError(e.response?.data?.message || 'Không tải được')), [tab]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { storeService.getStores().then(setStores).catch(() => {}); }, []);

  const stop = async (w) => {
    if (!window.confirm(`Kết thúc sớm khung "${w.title}"? Khách sẽ không đặt hỏa tốc được nữa (đơn đã đặt vẫn giao bình thường).`)) return;
    try { await api.put(`/express/admin/${w._id}`, { isActive: false }); load(); } catch (e) { alert(e.response?.data?.message || 'Không thực hiện được'); }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
        <h1 className="fs-4 fw-bold mb-0"><LightningChargeFill className="text-warning me-2" />Giao hỏa tốc 2 giờ</h1>
        <Button variant="warning" className="ms-auto" onClick={() => setShow(true)}><Plus className="me-1" />Mở khung giờ</Button>
      </div>
      <div className="small text-muted mb-3">Chọn sản phẩm + bán kính (tối đa 20 km) + khung giờ. Khách trong phạm vi đặt đúng sản phẩm sẽ được tự xác nhận và phân công ngay cho shipper rảnh nhất của chi nhánh.</div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Nav variant="tabs" activeKey={tab} onSelect={setTab} className="mb-3">
        {[['open', 'Đang mở'], ['upcoming', 'Sắp mở'], ['ended', 'Đã kết thúc'], ['all', 'Tất cả']].map(([k, l]) => <Nav.Item key={k}><Nav.Link eventKey={k}>{l}</Nav.Link></Nav.Item>)}
      </Nav>
      {!windows ? <Spinner size="sm" /> : !windows.length ? (
        <div className="text-center text-muted border rounded-3 py-5"><LightningChargeFill size={36} className="text-warning opacity-50 mb-2" /><div>Chưa có khung giờ nào.</div><Button size="sm" variant="warning" className="mt-2" onClick={() => setShow(true)}>Mở khung giờ hỏa tốc</Button></div>
      ) : (
        <Row xs={1} lg={2} className="g-3">
          {windows.map((w) => {
            const [key, label, bg] = status(w);
            return (
              <Col key={w._id}>
                <Card className={`h-100 shadow-sm ${key === 'open' ? 'border-warning' : ''}`}>
                  <Card.Body>
                    <div className="d-flex align-items-start gap-2 mb-2">
                      <div className="flex-grow-1">
                        <div className="fw-semibold">{w.title} <Badge bg={bg}>{label}</Badge></div>
                        <div className="small text-muted">{w.storeId?.name} · bởi {w.createdByName || '—'}</div>
                      </div>
                      {key !== 'ended' && <Button size="sm" variant="outline-danger" onClick={() => stop(w)}><StopCircle className="me-1" />Kết thúc</Button>}
                    </div>
                    <div className="d-flex flex-wrap gap-3 small mb-2">
                      <span><Clock className="me-1" />{hhmm(w.startAt)} → {hhmm(w.endAt)}</span>
                      <span><GeoAlt className="me-1" />{w.radiusKm} km</span>
                      <span>Phí {vnd(w.fee)}</span>
                      <span>Cam kết {w.slaMinutes} phút</span>
                      <span><BoxSeam className="me-1" />{w.ordersCount}{w.maxOrders ? `/${w.maxOrders}` : ''} đơn</span>
                    </div>
                    <div className="d-flex flex-wrap gap-1 mb-2">
                      {w.productIds.slice(0, 8).map((p) => <Badge key={p._id} bg="light" text="dark" className="border fw-normal">{p.title}</Badge>)}
                      {w.productIds.length > 8 && <Badge bg="light" text="dark" className="border">+{w.productIds.length - 8}</Badge>}
                    </div>
                    <div className="d-flex gap-3 small border-top pt-2">
                      <span>Đơn: <b>{w.stats.orders}</b></span>
                      <span className="text-success">Đã giao: <b>{w.stats.delivered}</b></span>
                      <span className={w.stats.late ? 'text-danger' : 'text-muted'}>Trễ hạn: <b>{w.stats.late}</b></span>
                      <span className="ms-auto">Doanh thu: <b>{vnd(w.stats.revenue)}</b></span>
                    </div>
                    {w.note && <div className="small text-muted mt-1">📝 {w.note}</div>}
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <WindowModal show={show} onHide={() => setShow(false)} onSaved={load} stores={stores} scopedStore={scopedStore} />
    </div>
  );
}
