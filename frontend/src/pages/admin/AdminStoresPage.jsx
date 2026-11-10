import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Form, Modal, Badge, Alert, Spinner, InputGroup } from 'react-bootstrap';
import { Shop, GeoAltFill, Telephone, Clock, People, BoxSeam, ReceiptCutoff, Search, Plus, CheckCircleFill } from 'react-bootstrap-icons';
import { storeService } from '../../services/storeService';
import { locationService } from '../../services/locationService';
import StoreStaffModal from '../../components/admin/StoreStaffModal';

const emptyForm = { name: '', address: '', city: '', phoneNumber: '', email: '', openHours: '8:00 - 21:30', lat: '', lng: '' };

// Quản lý chi nhánh: mở chi nhánh mới chỉ cần "Thêm chi nhánh" - chi nhánh hiện ngay ở trang thanh toán, POS,
// tồn kho, nhân viên, khuyến mãi, thống kê. Sau đó nhập tồn kho và gán nhân viên (checklist trên từng thẻ).
export default function AdminStoresPage() {
  const [stores, setStores] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [form, setForm] = useState(null); // null = đóng form; có _id = đang sửa
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [staffOf, setStaffOf] = useState(null); // chi nhánh đang xem danh sách nhân viên

  const load = () => storeService.adminList().then(setStores).catch(() => setStores([]));
  useEffect(() => {
    load();
    locationService.getProvinces().then(setProvinces).catch(() => setProvinces([]));
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (stores || []).filter((s) => (showInactive || s.isActive) && (!needle || `${s.name} ${s.address} ${s.city}`.toLowerCase().includes(needle)));
  }, [stores, q, showInactive]);
  const inactiveCount = (stores || []).filter((s) => !s.isActive).length;

  const open = (s = null) => {
    setError('');
    setForm(s ? { ...emptyForm, ...s, lat: s.lat ?? '', lng: s.lng ?? '' } : emptyForm);
  };

  const save = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    const payload = {
      name: form.name, address: form.address, city: form.city, phoneNumber: form.phoneNumber, email: form.email,
      openHours: form.openHours, lat: form.lat === '' ? null : Number(form.lat), lng: form.lng === '' ? null : Number(form.lng)
    };
    try {
      if (form._id) {
        await storeService.update(form._id, payload);
      } else {
        const created = await storeService.create(payload);
        setJustCreated(created);
      }
      setForm(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Không lưu được chi nhánh');
    } finally { setSaving(false); }
  };

  const toggle = async (s) => {
    try {
      if (s.isActive) {
        if (!window.confirm(`Ngưng hoạt động chi nhánh "${s.name}"? Khách sẽ không chọn được chi nhánh này khi đặt hàng.`)) return;
        await storeService.deactivate(s._id);
      } else {
        await storeService.update(s._id, { isActive: true });
      }
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không cập nhật được');
    }
  };

  // Điền tọa độ từ đường dẫn Google Maps dán vào (dạng ...@16.0678,108.2208,17z hoặc ?q=16.06,108.22)
  const pasteMapLink = (text) => {
    const m = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (m) setForm((f) => ({ ...f, lat: m[1], lng: m[2] }));
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Chi nhánh</h1>
          <p className="small text-muted mb-0">Mở chi nhánh mới: bấm "Thêm chi nhánh", sau đó nhập tồn kho và gán nhân viên.</p>
        </div>
        <Button onClick={() => open()} className="d-inline-flex align-items-center gap-1"><Plus size={20} /> Thêm chi nhánh</Button>
      </div>

      {justCreated && (
        <Alert variant="success" dismissible onClose={() => setJustCreated(null)}>
          <div className="fw-semibold d-flex align-items-center gap-2"><CheckCircleFill /> Đã thêm chi nhánh "{justCreated.name}"</div>
          <div className="small mt-1">Chi nhánh đã hiện ở trang thanh toán và POS. Để bắt đầu bán hàng:</div>
          <ol className="small mb-0 mt-1">
            <li><Link to="/admin/inventory">Nhập tồn kho</Link> cho chi nhánh (chưa có hàng thì khách chưa chọn được chi nhánh khi đặt hàng)</li>
            <li><button type="button" className="btn btn-link p-0 align-baseline small" onClick={() => setStaffOf(justCreated)}>Thêm nhân viên</button> (nhân viên mới hoặc người đang làm ở chi nhánh khác - 1 người làm được nhiều chi nhánh)</li>
          </ol>
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <InputGroup style={{ maxWidth: 360 }}>
          <InputGroup.Text><Search /></InputGroup.Text>
          <Form.Control placeholder="Tìm theo tên, địa chỉ, tỉnh/thành..." value={q} onChange={(e) => setQ(e.target.value)} />
        </InputGroup>
        {inactiveCount > 0 && (
          <Form.Check type="switch" id="show-inactive" label={`Hiện chi nhánh đã ngưng (${inactiveCount})`} checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        )}
        <span className="small text-muted ms-auto">{(stores || []).filter((s) => s.isActive).length} chi nhánh đang hoạt động</span>
      </div>

      {!stores ? <div className="text-center py-5"><Spinner /></div> : (
        <Row className="g-3">
          {list.map((s) => {
            const st = s.stats || {};
            const ready = st.productsInStock > 0 && (st.staff + st.managers + st.transfersIn) > 0;
            return (
              <Col key={s._id} md={6} xl={4}>
                <Card className={`border-0 shadow-sm h-100 ${s.isActive ? '' : 'opacity-75'}`}>
                  <Card.Body className="d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="d-flex gap-2 align-items-center" style={{ minWidth: 0 }}>
                        <span className="icon-circle bg-primary-subtle flex-shrink-0"><Shop className="text-primary" /></span>
                        <div style={{ minWidth: 0 }}>
                          <div className="fw-semibold text-truncate">{s.name}</div>
                          <div className="small text-muted">{s.city}</div>
                        </div>
                      </div>
                      {s.isActive
                        ? (ready ? <Badge bg="success">Đang hoạt động</Badge> : <Badge bg="warning" text="dark">Chưa sẵn sàng</Badge>)
                        : <Badge bg="secondary">Đã ngưng</Badge>}
                    </div>

                    <div className="small mt-3 d-flex flex-column gap-1">
                      <div><GeoAltFill className="text-muted me-2" />{s.address || <span className="text-muted">Chưa có địa chỉ</span>}</div>
                      {s.phoneNumber && <div><Telephone className="text-muted me-2" />{s.phoneNumber}</div>}
                      <div><Clock className="text-muted me-2" />{s.openHours}</div>
                    </div>

                    <div className="d-flex gap-3 mt-3 small">
                      <button type="button" className="btn btn-link p-0 small text-decoration-none" title="Nhân viên chi nhánh chính / làm thêm / đang điều chuyển tới - bấm để xem"
                        onClick={() => setStaffOf(s)}>
                        <People className="me-1" />{st.staff + st.managers + st.transfersIn} nhân viên
                      </button>
                      <span title="Sản phẩm còn hàng / tổng số máy"><BoxSeam className="text-muted me-1" />{st.productsInStock} SP ({st.unitsInStock})</span>
                      <span title="Đơn đang xử lý"><ReceiptCutoff className="text-muted me-1" />{st.openOrders} đơn</span>
                    </div>

                    {s.isActive && !ready && (
                      <div className="small mt-2 p-2 rounded-2 bg-warning-subtle">
                        {st.productsInStock === 0 && <div>• Chưa có hàng - <Link to="/admin/inventory">nhập tồn kho</Link></div>}
                        {st.staff + st.managers + st.transfersIn === 0 && (
                          <div>• Chưa có nhân viên - <button type="button" className="btn btn-link p-0 small align-baseline" onClick={() => setStaffOf(s)}>thêm nhân viên</button></div>
                        )}
                      </div>
                    )}

                    <div className="d-flex gap-2 mt-auto pt-3">
                      <Button size="sm" variant="outline-primary" onClick={() => open(s)}>Sửa</Button>
                      {s.isActive && <Button size="sm" variant="outline-secondary" onClick={() => setStaffOf(s)}>Nhân viên</Button>}
                      {s.lat != null && s.lng != null && (
                        <a className="btn btn-sm btn-outline-secondary" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer">Bản đồ</a>
                      )}
                      <Button size="sm" variant={s.isActive ? 'outline-danger' : 'outline-success'} className="ms-auto" onClick={() => toggle(s)}>
                        {s.isActive ? 'Ngưng hoạt động' : 'Mở lại'}
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
          {list.length === 0 && <Col><div className="text-center text-muted py-5">Không có chi nhánh phù hợp</div></Col>}
        </Row>
      )}

      {staffOf && <StoreStaffModal store={staffOf} onHide={() => setStaffOf(null)} onChanged={load} />}

      <Modal show={Boolean(form)} onHide={() => setForm(null)} centered size="lg">
        {form && (
          <Form onSubmit={save}>
            <Modal.Header closeButton><Modal.Title className="fs-5">{form._id ? `Sửa chi nhánh ${form.name}` : 'Thêm chi nhánh mới'}</Modal.Title></Modal.Header>
            <Modal.Body>
              {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
              <Row className="g-3">
                <Col md={7}>
                  <Form.Label>Tên chi nhánh *</Form.Label>
                  <Form.Control required minLength={3} maxLength={120} placeholder="VD: TechShop Đà Nẵng" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Col>
                <Col md={5}>
                  <Form.Label>Tỉnh / thành phố *</Form.Label>
                  {/* Không tải được danh mục tỉnh thành -> cho gõ tay, không để form bị kẹt */}
                  {provinces.length ? (
                    <Form.Select required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                      <option value="">-- Chọn --</option>
                      {form.city && !provinces.some((p) => p.name === form.city) && <option value={form.city}>{form.city}</option>}
                      {provinces.map((p) => <option key={p._id} value={p.name}>{p.name}</option>)}
                    </Form.Select>
                  ) : (
                    <Form.Control required maxLength={80} placeholder="VD: Đà Nẵng" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  )}
                </Col>
                <Col md={12}>
                  <Form.Label>Địa chỉ *</Form.Label>
                  <Form.Control required={!form._id || Boolean(form.address)} maxLength={300} placeholder="Số nhà, đường, phường/xã" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Col>
                <Col md={4}>
                  <Form.Label>Số điện thoại</Form.Label>
                  <Form.Control type="tel" placeholder="VD: 0236 3888 999" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
                </Col>
                <Col md={4}>
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Col>
                <Col md={4}>
                  <Form.Label>Giờ mở cửa</Form.Label>
                  <Form.Control value={form.openHours} placeholder="8:00 - 21:30" onChange={(e) => setForm({ ...form, openHours: e.target.value })} />
                </Col>
                <Col md={12}>
                  <Form.Label>Vị trí trên bản đồ (tùy chọn - dùng cho "Chỉ đường" và gợi ý chi nhánh gần khách)</Form.Label>
                  <Form.Control size="sm" className="mb-2" placeholder="Dán đường dẫn Google Maps hoặc tọa độ (VD: 16.0678, 108.2208) để tự điền"
                    onChange={(e) => pasteMapLink(e.target.value)} />
                  <Row className="g-2">
                    <Col><Form.Control type="number" step="any" placeholder="Vĩ độ (lat)" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></Col>
                    <Col><Form.Control type="number" step="any" placeholder="Kinh độ (lng)" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></Col>
                  </Row>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setForm(null)}>Hủy</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : form._id ? 'Lưu thay đổi' : 'Thêm chi nhánh'}</Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </Container>
  );
}
