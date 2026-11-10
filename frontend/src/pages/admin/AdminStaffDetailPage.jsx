import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container, Tabs, Tab, Card, Row, Col, Form, Button, Badge, Alert, Table, Spinner } from 'react-bootstrap';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ArrowLeft, ArrowLeftRight, Building, HouseDoor, Star, StarFill } from 'react-bootstrap-icons';
import { staffService } from '../../services/staffService';
import { storeService } from '../../services/storeService';

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const shortVND = (v) => (v >= 1e6 ? `${Math.round(v / 1e6)}tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
const KIND = {
  home: { label: 'Chi nhánh chính', icon: HouseDoor, bg: 'primary' },
  transfer: { label: 'Điều chuyển tạm thời', icon: ArrowLeftRight, bg: 'warning' },
  manage: { label: 'Làm việc thêm', icon: Building, bg: 'info' }
};
const STATE = {
  active: { label: 'Đang diễn ra', bg: 'success' },
  upcoming: { label: 'Sắp bắt đầu', bg: 'info' },
  ended: { label: 'Đã kết thúc', bg: 'secondary' },
  cancelled: { label: 'Đã hủy', bg: 'dark' }
};
const RATING = ['', 'Chưa đạt', 'Cần cố gắng', 'Đạt', 'Tốt', 'Xuất sắc'];

// ---------- Tab: Quá trình làm việc + điều chuyển ----------
function HistoryTab({ staffId, onChanged }) {
  const [list, setList] = useState(null);
  const [stores, setStores] = useState([]);
  const [form, setForm] = useState({ storeId: '', startDate: '', months: 6, endDate: '', reason: '', title: '' });
  const [useEndDate, setUseEndDate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => staffService.assignments(staffId).then(setList).catch(() => setList([])), [staffId]);
  useEffect(() => { load(); storeService.getStores().then(setStores).catch(() => {}); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await staffService.transfer(staffId, {
        storeId: form.storeId,
        startDate: form.startDate ? new Date(`${form.startDate}T00:00:00`).toISOString() : undefined,
        ...(useEndDate ? { endDate: form.endDate ? new Date(`${form.endDate}T23:59:59`).toISOString() : undefined } : { months: Number(form.months) }),
        reason: form.reason,
        title: form.title
      });
      setForm({ storeId: '', startDate: '', months: 6, endDate: '', reason: '', title: '' });
      load(); onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Không điều chuyển được');
    } finally { setBusy(false); }
  };
  const end = async (a) => {
    const upcoming = a.state === 'upcoming';
    const note = window.prompt(upcoming ? 'Lý do hủy điều chuyển:' : 'Kết thúc điều chuyển sớm - ghi chú:', '');
    if (note === null) return;
    try { await staffService.endTransfer(staffId, a._id, note); load(); onChanged?.(); } catch (err) { alert(err.response?.data?.message || 'Lỗi'); }
  };

  return (
    <Row className="g-3">
      <Col lg={7}>
        <Card className="border-0 shadow-sm h-100">
          <Card.Body>
            <h3 className="fs-6 fw-bold mb-3">Quá trình làm việc</h3>
            {!list ? <Spinner size="sm" /> : list.length === 0 ? (
              <div className="text-muted small">Chưa có dữ liệu - nhân viên chưa được gán chi nhánh.</div>
            ) : (
              <div className="staff-timeline">
                {list.map((a) => {
                  const k = KIND[a.kind];
                  const st = STATE[a.state];
                  return (
                    <div key={a._id} className={`staff-timeline-item ${a.state}`}>
                      <span className={`staff-timeline-dot bg-${k.bg}`}><k.icon size={11} color="#fff" /></span>
                      <div className="d-flex justify-content-between flex-wrap gap-2">
                        <div>
                          <div className="fw-semibold">{a.storeId?.name || 'Chi nhánh đã xóa'}</div>
                          <div className="small text-muted">{k.label}{a.title ? ` · ${a.title}` : ''}</div>
                        </div>
                        <Badge bg={st.bg} className="align-self-start fw-normal">{st.label}</Badge>
                      </div>
                      <div className="small mt-1">
                        {fmtDay(a.startDate)} → {a.endDate ? fmtDay(a.endDate) : 'nay'}
                        {a.reason && <span className="text-muted"> · {a.reason}</span>}
                      </div>
                      {a.endNote && <div className="small text-muted">{a.endNote}{a.endedBy?.name ? ` (${a.endedBy.name})` : ''}</div>}
                      {a.kind === 'transfer' && ['active', 'upcoming'].includes(a.state) && (
                        <Button size="sm" variant="outline-danger" className="mt-2 py-0" onClick={() => end(a)}>
                          {a.state === 'upcoming' ? 'Hủy điều chuyển' : 'Kết thúc sớm'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card.Body>
        </Card>
      </Col>
      <Col lg={5}>
        <Card className="border-0 shadow-sm">
          <Card.Body>
            <h3 className="fs-6 fw-bold mb-1">Điều chuyển tạm thời</h3>
            <p className="small text-muted">Trong thời gian điều chuyển, nhân viên làm việc ở chi nhánh mới; hết hạn tự quay về chi nhánh chính.</p>
            {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
            <Form onSubmit={submit}>
              <Form.Group className="mb-2">
                <Form.Label className="small fw-medium">Chi nhánh đến</Form.Label>
                <Form.Select required value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}>
                  <option value="">-- Chọn chi nhánh --</option>
                  {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </Form.Select>
              </Form.Group>
              <Row className="g-2 mb-2">
                <Col xs={6}>
                  <Form.Label className="small fw-medium">Bắt đầu</Form.Label>
                  <Form.Control type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  <Form.Text>Trống = hôm nay</Form.Text>
                </Col>
                <Col xs={6}>
                  <Form.Label className="small fw-medium">{useEndDate ? 'Kết thúc' : 'Thời hạn'}</Form.Label>
                  {useEndDate ? (
                    <Form.Control type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                  ) : (
                    <Form.Select value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })}>
                      {[1, 2, 3, 6, 9, 12, 18, 24].map((m) => <option key={m} value={m}>{m} tháng</option>)}
                    </Form.Select>
                  )}
                  <Form.Check className="small mt-1" id="use-end" label="Chọn ngày kết thúc" checked={useEndDate} onChange={(e) => setUseEndDate(e.target.checked)} />
                </Col>
              </Row>
              <Form.Control className="mb-2" placeholder="Chức danh tại chi nhánh mới (tùy chọn)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Form.Control as="textarea" rows={2} className="mb-2" placeholder="Lý do (VD: hỗ trợ khai trương chi nhánh)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button type="submit" disabled={busy} className="w-100">Điều chuyển</Button>
            </Form>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}

// ---------- Tab: Hiệu suất + đánh giá cuối năm ----------
function PerformanceTab({ staffId }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState(null);
  const [review, setReview] = useState({ rating: 3, bonus: 0, strengths: '', improvements: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setData(null); setMsg('');
    staffService.performance(staffId, year).then((d) => {
      setData(d);
      setReview(d.review ? { rating: d.review.rating, bonus: d.review.bonus, strengths: d.review.strengths || '', improvements: d.review.improvements || '' } : { rating: 3, bonus: 0, strengths: '', improvements: '' });
    }).catch(() => setData({ error: true }));
  }, [staffId, year]);

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await staffService.saveReview(staffId, year, { ...review, rating: Number(review.rating), bonus: Number(review.bonus) || 0 });
      setMsg('Đã lưu đánh giá');
    } catch (err) { setMsg(err.response?.data?.message || 'Không lưu được'); }
  };

  const t = data?.totals;
  const kpis = t && [
    { label: 'Doanh số bán tại quầy', value: formatVND(t.posRevenue), sub: `${t.posOrders} đơn` },
    { label: 'Đơn hàng đã xử lý', value: t.ordersHandled, sub: 'xác nhận, đóng gói, bàn giao...' },
    { label: 'Giao hàng thành công', value: t.deliveriesDone, sub: t.deliveriesAssigned ? `/${t.deliveriesAssigned} đơn · ${t.deliveryFailures} lần thất bại` : 'không phụ trách giao hàng' },
    { label: 'Phiếu sửa chữa đã xử lý', value: t.repairTickets, sub: t.repairRating ? `khách chấm ${t.repairRating}/5` : 'chưa có đánh giá của khách' },
    { label: 'Gói bảo hành đã bán', value: t.extensionsSold, sub: formatVND(t.extensionRevenue) }
  ];
  const canReview = year < thisYear || new Date().getMonth() >= 10; // đánh giá từ tháng 11 hoặc cho năm trước

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3">
        <Form.Label className="mb-0 small fw-medium">Năm</Form.Label>
        <Form.Select size="sm" style={{ width: 110 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 5 }, (_, i) => thisYear - i).map((y) => <option key={y}>{y}</option>)}
        </Form.Select>
        {!data && <Spinner size="sm" />}
      </div>
      {data?.error && <Alert variant="danger">Không tải được số liệu</Alert>}
      {t && (
        <>
          <Row className="g-2 mb-3">
            {kpis.map((k) => (
              <Col key={k.label} xs={6} lg>
                <Card className="border-0 shadow-sm h-100"><Card.Body className="py-2">
                  <div className="small text-muted">{k.label}</div>
                  <div className="fs-5 fw-bold">{k.value}</div>
                  <div className="small text-muted">{k.sub}</div>
                </Card.Body></Card>
              </Col>
            ))}
          </Row>
          <Row className="g-3 mb-3">
            <Col lg={8}>
              <Card className="border-0 shadow-sm h-100"><Card.Body>
                <h3 className="fs-6 fw-bold">Theo tháng</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(m) => `T${m}`} fontSize={12} />
                    <YAxis yAxisId="v" tickFormatter={shortVND} fontSize={12} width={45} />
                    <YAxis yAxisId="n" orientation="right" allowDecimals={false} fontSize={12} width={30} />
                    <Tooltip formatter={(v, n) => (n === 'Doanh số quầy' ? formatVND(v) : v)} labelFormatter={(m) => `Tháng ${m}/${year}`} />
                    <Bar yAxisId="v" dataKey="posRevenue" name="Doanh số quầy" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="n" dataKey="ordersHandled" name="Đơn đã xử lý" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="n" dataKey="repairTickets" name="Phiếu sửa chữa" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body></Card>
            </Col>
            <Col lg={4}>
              <Card className="border-0 shadow-sm h-100"><Card.Body>
                <h3 className="fs-6 fw-bold">Theo chi nhánh</h3>
                <Table size="sm" className="mb-0 small">
                  <thead><tr><th>Chi nhánh</th><th className="text-end">Số ngày</th><th className="text-end">Doanh số</th></tr></thead>
                  <tbody>
                    {[...new Set([...data.daysByStore.map((d) => d.storeId), ...data.byStore.map((b) => b.storeId)])].map((id) => {
                      const d = data.daysByStore.find((x) => x.storeId === id);
                      const b = data.byStore.find((x) => x.storeId === id);
                      return (
                        <tr key={id}>
                          <td>{d?.name || b?.name}</td>
                          <td className="text-end">{d?.days ?? '—'}</td>
                          <td className="text-end">{b ? formatVND(b.posRevenue) : '—'}</td>
                        </tr>
                      );
                    })}
                    {!data.daysByStore.length && !data.byStore.length && <tr><td colSpan={3} className="text-muted">Chưa có dữ liệu</td></tr>}
                  </tbody>
                </Table>
              </Card.Body></Card>
            </Col>
          </Row>

          <Card className="border-0 shadow-sm"><Card.Body>
            <h3 className="fs-6 fw-bold mb-1">Đánh giá cuối năm {year}</h3>
            {data.review && <div className="small text-muted mb-2">Đánh giá lần cuối bởi {data.review.reviewedBy?.name || 'admin'} ngày {fmtDay(data.review.updatedAt)}</div>}
            {!canReview && !data.review && <Alert variant="light" className="small border">Đánh giá năm nay mở từ tháng 11. Bạn vẫn có thể lưu bản nháp sớm.</Alert>}
            <Form onSubmit={save}>
              <Form.Label className="small fw-medium">Xếp loại</Form.Label>
              <div className="d-flex align-items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="btn btn-link p-0 text-warning" aria-label={`${n} sao`} onClick={() => setReview({ ...review, rating: n })}>
                    {n <= review.rating ? <StarFill size={22} /> : <Star size={22} />}
                  </button>
                ))}
                <span className="ms-2 small fw-medium">{RATING[review.rating]}</span>
              </div>
              <Row className="g-2">
                <Col md={4}>
                  <Form.Label className="small fw-medium">Tiền thưởng (VNĐ)</Form.Label>
                  <Form.Control type="number" min={0} step={100000} value={review.bonus} onChange={(e) => setReview({ ...review, bonus: e.target.value })} />
                </Col>
                <Col md={8} />
                <Col md={6}>
                  <Form.Label className="small fw-medium">Điểm mạnh</Form.Label>
                  <Form.Control as="textarea" rows={3} maxLength={1000} value={review.strengths} onChange={(e) => setReview({ ...review, strengths: e.target.value })} />
                </Col>
                <Col md={6}>
                  <Form.Label className="small fw-medium">Cần cải thiện</Form.Label>
                  <Form.Control as="textarea" rows={3} maxLength={1000} value={review.improvements} onChange={(e) => setReview({ ...review, improvements: e.target.value })} />
                </Col>
              </Row>
              <div className="d-flex align-items-center gap-2 mt-3">
                <Button type="submit">Lưu đánh giá</Button>
                {msg && <span className="small">{msg}</span>}
              </div>
              <div className="small text-muted mt-2">Số liệu hiệu suất được chụp lại cùng đánh giá để làm căn cứ về sau.</div>
            </Form>
          </Card.Body></Card>
        </>
      )}
    </>
  );
}

export default function AdminStaffDetailPage() {
  const { id } = useParams();
  const [staff, setStaff] = useState(null);
  const load = useCallback(() => staffService.getAll().then((list) => setStaff(list.find((s) => s._id === id) || false)), [id]);
  useEffect(() => { load(); }, [load]);

  if (staff === null) return <div className="text-center py-5"><Spinner /></div>;
  if (staff === false) return <Container fluid><Alert variant="warning">Không tìm thấy nhân viên</Alert></Container>;
  return (
    <Container fluid>
      <Link to="/admin/staff" className="small text-decoration-none d-inline-flex align-items-center gap-1 mb-2"><ArrowLeft /> Nhân viên</Link>
      <div className="d-flex align-items-center gap-3 mb-3">
        <div className="admin-user-initial" style={{ width: 48, height: 48, fontSize: 20 }}>{staff.name?.[0]?.toUpperCase()}</div>
        <div>
          <h1 className="fs-4 fw-bold mb-0">{staff.name}</h1>
          <div className="small text-muted">
            {staff.title || 'Nhân viên'} · {staff.email} · Chi nhánh chính: {staff.storeId?.name || 'chưa gán'}
            {staff.managedStoreIds?.length > 0 && ` · làm thêm ở ${staff.managedStoreIds.map((m) => m.name).join(', ')}`}
          </div>
        </div>
      </div>
      <Tabs defaultActiveKey="history" className="mb-3" mountOnEnter>
        <Tab eventKey="history" title="Quá trình làm việc & điều chuyển"><HistoryTab staffId={id} onChanged={load} /></Tab>
        <Tab eventKey="performance" title="Hiệu suất & đánh giá cuối năm"><PerformanceTab staffId={id} /></Tab>
      </Tabs>
    </Container>
  );
}
