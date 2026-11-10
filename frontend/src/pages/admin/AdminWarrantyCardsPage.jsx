import { useCallback, useEffect, useState } from 'react';
import { Container, Tabs, Tab, Form, Button, Stack, Alert, Modal, Table, Badge, Row, Col, InputGroup, Spinner } from 'react-bootstrap';
import { Search } from 'react-bootstrap-icons';
import { warrantyCardService } from '../../services/warrantyCardService';
import { productService } from '../../services/productService';
import { useAuth } from '../../store/AuthContext';
import WarrantyCardView, { formatVND } from '../../components/WarrantyCardView';
import AdminPagination from '../../components/admin/AdminPagination';
import { MultiPicker, useScopeOptions, idsOf } from '../../components/admin/ScopePicker';

// ---------- Tab 1: Sổ bảo hành ----------
function CardsTab() {
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState({ data: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(null);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [channel, setChannel] = useState('cash');
  const [paid, setPaid] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback((query = q, st = state, p = page) => {
    setLoading(true);
    warrantyCardService.adminList({ q: query || undefined, state: st || undefined, page: p })
      .then(setRes).catch(() => setRes({ data: [], total: 0, totalPages: 1 })).finally(() => setLoading(false));
  }, [q, state, page]);
  useEffect(() => { load(); }, [state, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const replace = (card) => setRes((r) => ({ ...r, data: r.data.map((c) => (c._id === card._id ? card : c)) }));
  const run = async (fn, msg) => {
    try { replace(await fn()); } catch (err) { alert(err.response?.data?.message || msg); }
  };

  const editSerial = (card) => {
    const serial = window.prompt('Nhập số IMEI / Serial của máy:', card.serial || '');
    if (serial === null) return;
    run(() => warrantyCardService.adminUpdate(card._id, { serial }), 'Không lưu được IMEI');
  };
  const confirmExt = (card, ext) => {
    const note = window.prompt(`Xác nhận đã nhận ${formatVND(ext.price)} cho gói "${ext.planName}". Ghi chú / mã giao dịch:`, '');
    if (note === null) return;
    run(() => warrantyCardService.adminConfirm(card._id, ext._id, note), 'Không xác nhận được');
  };
  const cancelExt = (card, ext) => {
    const note = window.prompt(`Lý do hủy gói "${ext.planName}":`, '');
    if (note === null) return;
    run(() => warrantyCardService.adminCancel(card._id, ext._id, note), 'Không hủy được');
  };
  const openSell = async (card) => {
    setSelling(card); setPaid(false); setModalError(''); setPlans([]); setPlanId('');
    try {
      const list = await warrantyCardService.adminPlans(card._id);
      setPlans(list); setPlanId(list[0]?._id || '');
    } catch (err) { setModalError(err.response?.data?.message || 'Không tải được gói'); }
  };
  const submitSell = async () => {
    setModalError('');
    try {
      replace(await warrantyCardService.adminSell(selling._id, planId, channel));
      setSelling(null);
    } catch (err) { setModalError(err.response?.data?.message || 'Không bán được gói'); }
  };

  return (
    <>
      <Form onSubmit={(e) => { e.preventDefault(); setPage(1); load(q, state, 1); }} className="d-flex flex-wrap gap-2 mb-3">
        <InputGroup style={{ maxWidth: 420 }}>
          <Form.Control placeholder="Mã bảo hành, IMEI, mã đơn, SĐT, tên khách, sản phẩm..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit"><Search /></Button>
        </InputGroup>
        <Form.Select style={{ maxWidth: 220 }} value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}>
          <option value="">Tất cả sổ bảo hành</option>
          <option value="pending_payment">Có gói chờ thanh toán</option>
        </Form.Select>
        <span className="align-self-center small text-muted">{res.total} sổ {loading && <Spinner size="sm" />}</span>
      </Form>

      <Stack gap={2}>
        {res.data.map((card) => (
          <WarrantyCardView
            key={card._id}
            card={{
              ...card,
              extensions: card.extensions.map((e) => ({
                ...e,
                extraAction: e.status === 'pending' && (
                  <>
                    <Button size="sm" variant="success" className="py-0" onClick={() => confirmExt(card, e)}>Đã thu tiền</Button>
                    <Button size="sm" variant="outline-danger" className="py-0" onClick={() => cancelExt(card, e)}>Hủy</Button>
                  </>
                )
              }))
            }}
            showCustomer
            actions={card.state !== 'void' && (
              <>
                <Button size="sm" variant="outline-secondary" onClick={() => editSerial(card)}>{card.serial ? 'Sửa IMEI' : 'Nhập IMEI / Serial'}</Button>
                {card.inWarranty && card.provider !== 'manufacturer' && (
                  <Button size="sm" variant="outline-primary" onClick={() => openSell(card)}>Bán gói gia hạn</Button>
                )}
              </>
            )}
          />
        ))}
        {!loading && res.data.length === 0 && <div className="text-muted text-center py-4">Không có sổ bảo hành phù hợp</div>}
      </Stack>
      {res.totalPages > 1 && <div className="mt-3"><AdminPagination page={page} totalPages={res.totalPages} onChange={setPage} /></div>}

      <Modal show={Boolean(selling)} onHide={() => setSelling(null)} centered>
        <Modal.Header closeButton><Modal.Title className="fs-5">Bán gói gia hạn tại quầy</Modal.Title></Modal.Header>
        <Modal.Body>
          {selling && <div className="small mb-3"><strong>{selling.productName}</strong> · {selling.customerName}</div>}
          {modalError && <Alert variant="danger" className="small py-2">{modalError}</Alert>}
          {plans.length === 0 && !modalError && <div className="small text-muted">Chưa có gói phù hợp - tạo gói ở tab "Gói gia hạn".</div>}
          {plans.map((p) => (
            <Form.Check key={p._id} type="radio" id={`sell-${p._id}`} name="sell" className="mb-2" checked={planId === p._id}
              onChange={() => setPlanId(p._id)} label={<><strong>{p.name}</strong> (+{p.months} tháng) - {formatVND(p.price)}</>} />
          ))}
          {plans.length > 0 && (
            <>
              <Form.Select size="sm" className="mt-2" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="cash">Tiền mặt</option>
                <option value="bank_transfer">Chuyển khoản</option>
              </Form.Select>
              <Form.Check className="mt-3" id="sell-paid" checked={paid} onChange={(e) => setPaid(e.target.checked)}
                label={`Đã thu đủ ${formatVND(plans.find((p) => p._id === planId)?.price)}`} />
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setSelling(null)}>Đóng</Button>
          <Button disabled={!planId || !paid} onClick={submitSell}>Xác nhận bán</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

// ---------- Tab 2: Gói gia hạn (admin) ----------
const emptyPlan = { name: '', description: '', months: 12, pricePercent: 5, fixedPrice: 0, minPrice: 0, categoryIds: [], isActive: true };
function PlansTab() {
  const scope = useScopeOptions();
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const load = () => warrantyCardService.listPlans().then(setPlans).catch(() => setPlans([]));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await warrantyCardService.savePlan(form._id, {
        ...form, months: Number(form.months), pricePercent: Number(form.pricePercent), fixedPrice: Number(form.fixedPrice), minPrice: Number(form.minPrice)
      });
      setForm(null);
      load();
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được gói'); }
  };
  const toggle = async (p) => {
    try { await warrantyCardService.savePlan(p._id, { isActive: !p.isActive }); load(); } catch (err) { alert(err.response?.data?.message || 'Lỗi'); }
  };
  const priceText = (p) => [p.pricePercent ? `${p.pricePercent}% giá máy` : '', p.fixedPrice ? `+ ${formatVND(p.fixedPrice)}` : '', p.minPrice ? `(tối thiểu ${formatVND(p.minPrice)})` : ''].filter(Boolean).join(' ');

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="small text-muted">Giá gói = max(tối thiểu, % × giá máy) + phí cố định. Chỉ bán cho máy còn bảo hành và do cửa hàng bảo hành.</div>
        <Button onClick={() => { setError(''); setForm(emptyPlan); }}>+ Tạo gói</Button>
      </div>
      <Table hover responsive className="bg-white align-middle">
        <thead><tr><th>Gói</th><th>Thời gian</th><th>Giá</th><th>Danh mục</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p._id}>
              <td><div className="fw-medium">{p.name}</div><div className="small text-muted">{p.description}</div></td>
              <td>+{p.months} tháng</td>
              <td className="small">{priceText(p)}</td>
              <td className="small">{p.categoryIds?.length ? p.categoryIds.map((c) => c.name).join(', ') : 'Tất cả'}</td>
              <td><Badge bg={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Đang bán' : 'Ngừng bán'}</Badge></td>
              <td className="text-nowrap">
                <Button size="sm" variant="outline-primary" className="me-1" onClick={() => { setError(''); setForm({ ...p, categoryIds: idsOf(p.categoryIds) }); }}>Sửa</Button>
                <Button size="sm" variant={p.isActive ? 'outline-danger' : 'outline-success'} onClick={() => toggle(p)}>{p.isActive ? 'Ngừng bán' : 'Bán lại'}</Button>
              </td>
            </tr>
          ))}
          {plans.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">Chưa có gói gia hạn nào</td></tr>}
        </tbody>
      </Table>

      <Modal show={Boolean(form)} onHide={() => setForm(null)} centered>
        {form && (
          <Form onSubmit={save}>
            <Modal.Header closeButton><Modal.Title className="fs-5">{form._id ? 'Sửa gói' : 'Tạo gói bảo hành mở rộng'}</Modal.Title></Modal.Header>
            <Modal.Body>
              {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
              <Row className="g-3">
                <Col md={8}><Form.Label>Tên gói</Form.Label><Form.Control required value={form.name} placeholder="VD: Bảo hành mở rộng 12 tháng" onChange={(e) => setForm({ ...form, name: e.target.value })} /></Col>
                <Col md={4}><Form.Label>Số tháng</Form.Label><Form.Control type="number" min={1} max={60} required value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} /></Col>
                <Col md={4}><Form.Label>% giá máy</Form.Label><Form.Control type="number" min={0} max={100} step="0.1" value={form.pricePercent} onChange={(e) => setForm({ ...form, pricePercent: e.target.value })} /></Col>
                <Col md={4}><Form.Label>Giá tối thiểu</Form.Label><Form.Control type="number" min={0} value={form.minPrice} onChange={(e) => setForm({ ...form, minPrice: e.target.value })} /></Col>
                <Col md={4}><Form.Label>Phí cố định</Form.Label><Form.Control type="number" min={0} value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} /></Col>
                <Col md={12}><Form.Label>Áp dụng cho danh mục (trống = tất cả)</Form.Label>
                  <MultiPicker value={form.categoryIds} onChange={(v) => setForm({ ...form, categoryIds: v })} options={scope.categories} placeholder="Tìm danh mục..." /></Col>
                <Col md={12}><Form.Label>Mô tả</Form.Label><Form.Control as="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setForm(null)}>Hủy</Button>
              <Button type="submit">Lưu</Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </>
  );
}

// ---------- Tab 3: Trung tâm bảo hành của hãng (admin) ----------
function BrandCentersTab() {
  const [brands, setBrands] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saved, setSaved] = useState('');
  useEffect(() => {
    productService.getBrands().then((list) => {
      setBrands(list);
      setDrafts(Object.fromEntries(list.map((b) => [b._id, { name: '', phone: '', website: '', address: '', lookupUrl: '', ...(b.warrantyCenter || {}) }])));
    }).catch(() => {});
  }, []);
  const set = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));
  const save = async (b) => {
    setSaved('');
    try {
      await warrantyCardService.saveBrandCenter(b._id, drafts[b._id]);
      setSaved(b._id);
    } catch (err) { alert(err.response?.data?.message || 'Không lưu được'); }
  };
  return (
    <>
      <div className="small text-muted mb-3">
        Dùng cho sản phẩm chọn "Bảo hành do hãng quản lý" (trong form sản phẩm). Khách xem được thông tin này trong sổ bảo hành.
      </div>
      <Stack gap={2}>
        {brands.map((b) => (
          <div key={b._id} className="border rounded-3 p-3 bg-white">
            <div className="fw-semibold mb-2">{b.name}</div>
            <Row className="g-2">
              {[['name', 'Tên trung tâm bảo hành'], ['phone', 'Hotline'], ['address', 'Địa chỉ'], ['website', 'Website (https://...)'], ['lookupUrl', 'Trang tra cứu bảo hành của hãng']].map(([k, label]) => (
                <Col md={k === 'address' ? 12 : 6} key={k}>
                  <Form.Control size="sm" placeholder={label} aria-label={label} value={drafts[b._id]?.[k] || ''} onChange={(e) => set(b._id, k, e.target.value)} />
                </Col>
              ))}
            </Row>
            <div className="d-flex align-items-center gap-2 mt-2">
              <Button size="sm" onClick={() => save(b)}>Lưu</Button>
              {saved === b._id && <span className="small text-success">Đã lưu - sổ bảo hành cũ của hãng đã được cập nhật</span>}
            </div>
          </div>
        ))}
      </Stack>
    </>
  );
}

export default function AdminWarrantyCardsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  return (
    <Container fluid>
      <h1 className="fs-4 fw-bold mb-1">Sổ bảo hành điện tử</h1>
      <p className="text-muted small mb-3">
        Mỗi máy bán ra có 1 sổ bảo hành, tạo tự động khi giao hàng thành công. Thời hạn theo sản phẩm (mặc định 12 tháng),
        tính từ ngày mua hoặc ngày kích hoạt, cộng thêm các gói gia hạn khách đã mua.
      </p>
      <Tabs defaultActiveKey="cards" className="mb-3" mountOnEnter>
        <Tab eventKey="cards" title="Sổ bảo hành"><CardsTab /></Tab>
        {isAdmin && <Tab eventKey="plans" title="Gói gia hạn"><PlansTab /></Tab>}
        {isAdmin && <Tab eventKey="brands" title="Trung tâm bảo hành hãng"><BrandCentersTab /></Tab>}
      </Tabs>
    </Container>
  );
}
