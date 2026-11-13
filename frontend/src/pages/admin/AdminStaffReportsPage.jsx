import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { Card, Row, Col, Form, Spinner, Alert, Table, Nav, Badge, Button } from 'react-bootstrap';
import { Trophy, Cart3, Truck, Tools, People, StarFill, ChevronRight } from 'react-bootstrap-icons';
import { staffReportService } from '../../services/staffReportService';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import AdminThumb from '../../components/admin/AdminThumb';
import { PeriodPicker, periodPresets, Kpi, Delta, money, shortMoney } from '../../components/admin/StaffReportView';

const TABS = [
  ['overview', 'Tổng quan', People],
  ['sales', 'Bán hàng', Cart3],
  ['delivery', 'Giao hàng', Truck],
  ['warranty', 'Bảo hành', Tools]
];
const PIE = ['#0d6efd', '#198754', '#6f42c1', '#fd7e14', '#20c997', '#adb5bd'];
const labelOf = (key) => (key?.length === 10 ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : `T${Number(key?.slice(5, 7))}/${key?.slice(2, 4)}`);
const star = (v) => (v == null ? <span className="text-muted">—</span> : <span className={v < 3.5 ? 'text-danger fw-semibold' : v >= 4.5 ? 'text-success fw-semibold' : ''}>{v}<StarFill size={10} className="text-warning ms-1" /></span>);
const medal = (i) => (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1);

// Cột của bảng xếp hạng theo vai trò
const COLUMNS = {
  sales: [
    ['Doanh thu', (r) => r.sales.revenue, (r) => <b>{shortMoney(r.sales.revenue)}</b>, true],
    ['Đơn', (r) => r.sales.orders, (r) => r.sales.orders],
    ['Sản phẩm', (r) => r.sales.units, (r) => r.sales.units],
    ['TB/đơn', (r) => r.sales.avgOrder, (r) => shortMoney(r.sales.avgOrder)],
    ['Xác nhận online', (r) => r.sales.onlineConfirmed, (r) => r.sales.onlineConfirmed],
    ['Đánh giá', (r) => r.sales.rating ?? -1, (r) => star(r.sales.rating)]
  ],
  delivery: [
    ['Thành công', (r) => r.delivery.delivered, (r) => <b>{r.delivery.delivered}</b>, true],
    ['Thất bại', (r) => r.delivery.failedTries, (r) => <span className={r.delivery.failedTries ? 'text-danger' : ''}>{r.delivery.failedTries}</span>],
    ['Tỷ lệ', (r) => r.delivery.successRate ?? -1, (r) => (r.delivery.successRate == null ? '—' : `${r.delivery.successRate}%`)],
    ['TG giao TB', (r) => -(r.delivery.avgHours ?? 999), (r) => (r.delivery.avgHours == null ? '—' : `${r.delivery.avgHours}h`)],
    ['COD', (r) => r.delivery.cod, (r) => shortMoney(r.delivery.cod)],
    ['Điểm GH', (r) => r.delivery.score ?? -1, (r) => star(r.delivery.score)],
    ['Khen/Chê', (r) => r.delivery.praise - r.delivery.complaints, (r) => <><span className="text-success">{r.delivery.praise}</span>/<span className={r.delivery.complaints ? 'text-danger' : 'text-muted'}>{r.delivery.complaints}</span></>]
  ],
  warranty: [
    ['Hoàn tất', (r) => r.warranty.done, (r) => <b>{r.warranty.done}</b>, true],
    ['Tiếp nhận', (r) => r.warranty.tickets, (r) => r.warranty.tickets],
    ['Đang xử lý', (r) => r.warranty.inProgress, (r) => r.warranty.inProgress],
    ['TG xử lý TB', (r) => -(r.warranty.avgDays ?? 999), (r) => (r.warranty.avgDays == null ? '—' : `${r.warranty.avgDays} ngày`)],
    ['Doanh thu', (r) => r.warranty.revenue + r.warranty.extensionRevenue, (r) => shortMoney(r.warranty.revenue + r.warranty.extensionRevenue)],
    ['Gia hạn', (r) => r.warranty.extensions, (r) => r.warranty.extensions],
    ['Đánh giá', (r) => r.warranty.rating ?? -1, (r) => star(r.warranty.rating)]
  ]
};

function Leaderboard({ rows, kind }) {
  const cols = COLUMNS[kind];
  const [sortIdx, setSortIdx] = useState(0);
  const sorted = useMemo(() => [...rows].sort((a, b) => cols[sortIdx][1](b) - cols[sortIdx][1](a)), [rows, cols, sortIdx]);
  const max = Math.max(1, ...rows.map((r) => cols[0][1](r)));
  if (!rows.length) return <div className="text-muted small p-3">Không có nhân viên thuộc nhóm này trong phạm vi bạn quản lý.</div>;
  return (
    <div className="table-responsive">
      <Table hover size="sm" className="align-middle small mb-0">
        <thead>
          <tr className="text-muted">
            <th style={{ width: 36 }}>#</th><th>Nhân viên</th>
            {cols.map(([label], i) => (
              <th key={label} role="button" className={`text-end text-nowrap ${sortIdx === i ? 'text-primary' : ''}`} onClick={() => setSortIdx(i)}>{label}{sortIdx === i && ' ▾'}</th>
            ))}
            <th className="text-end text-nowrap">So kỳ trước</th><th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r._id}>
              <td className="fs-6">{medal(i)}</td>
              <td>
                <div className="d-flex align-items-center gap-2">
                  <AdminThumb src={r.avatar} name={r.name} size={28} rounded />
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-medium text-truncate" style={{ maxWidth: 180 }}>{r.name}{!r.isActive && <Badge bg="secondary" className="ms-1">Đã khóa</Badge>}</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>{r.store}{r.isDirect && <Badge bg="info-subtle" text="info-emphasis" className="ms-1 fw-normal">Trực tiếp</Badge>}{!r.isDirect && r.manager && <> · QL: {r.manager}</>}</div>
                    <div className="bg-body-secondary rounded mt-1" style={{ height: 4, width: 120 }}><div className="bg-primary rounded" style={{ height: 4, width: `${(cols[0][1](r) / max) * 100}%` }} /></div>
                  </div>
                </div>
              </td>
              {cols.map(([label, , render]) => <td key={label} className="text-end text-nowrap">{render(r)}</td>)}
              <td className="text-end"><Delta cur={cols[0][1](r)} prev={cols[0][1]({ ...r, ...r.prev })} /></td>
              <td className="text-end"><Link to={`/admin/staff-reports/${r._id}`} className="small text-nowrap">Chi tiết <ChevronRight size={10} /></Link></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// Báo cáo nhân viên cho QUẢN LÝ / ADMIN: tổng quan cả đội + bảng xếp hạng theo vai trò (bán hàng, giao hàng, bảo hành)
export default function AdminStaffReportsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [range, setRange] = useState(periodPresets()[0][2]);
  const [storeId, setStoreId] = useState('');
  // 'direct' = chỉ người báo cáo trực tiếp cho tôi
  const [scope, setScope] = useState(user?.role !== 'admin' && user?.directReports > 0 && !(user?.managedStoreIds || []).length ? 'direct' : '');
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isAdmin = user?.role === 'admin';
  const myStores = isAdmin ? stores : (user?.managedStoreIds || []).filter((s) => s && s._id);

  useEffect(() => { if (isAdmin) storeService.getStores().then(setStores).catch(() => {}); }, [isAdmin]);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    staffReportService.team({ from: range.from || undefined, to: range.to || undefined, storeId: storeId || undefined, scope: scope || undefined })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.response?.data?.message || 'Không tải được báo cáo'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [range, storeId, scope]);

  const t = data?.totals; const p = data?.prevTotals;
  const byKind = (k) => (data?.staff || []).filter((r) => r.kind === k || (k === 'sales' && r.kind === 'manager' && r.sales.orders > 0));
  const bucket = data?.range.bucket === 'day' ? 'ngày' : 'tháng';
  const top = (k, f) => [...byKind(k)].sort((a, b) => f(b) - f(a))[0];
  const stars = [
    ['Bán hàng giỏi nhất', top('sales', (r) => r.sales.revenue), (r) => money(r.sales.revenue), Cart3],
    ['Giao hàng xuất sắc', top('delivery', (r) => r.delivery.delivered * ((r.delivery.score || 4) / 5)), (r) => `${r.delivery.delivered} đơn · ${r.delivery.score ?? '—'}★`, Truck],
    ['Kỹ thuật viên tiêu biểu', top('warranty', (r) => r.warranty.done), (r) => `${r.warranty.done} phiếu · ${r.warranty.rating ?? '—'}★`, Tools]
  ].filter(([, r, f]) => r && f);
  // Cảnh báo cho quản lý
  const alerts = data ? [
    ...byKind('delivery').filter((r) => r.delivery.score != null && r.delivery.score < 3.5).map((r) => `${r.name}: điểm giao hàng ${r.delivery.score}★ (${r.delivery.complaints} phàn nàn)`),
    ...byKind('delivery').filter((r) => r.delivery.successRate != null && r.delivery.successRate < 85).map((r) => `${r.name}: tỷ lệ giao thành công chỉ ${r.delivery.successRate}%`),
    ...byKind('warranty').filter((r) => r.warranty.inProgress > 15).map((r) => `${r.name}: tồn ${r.warranty.inProgress} phiếu bảo hành chưa xong`),
    ...byKind('warranty').filter((r) => r.warranty.rating != null && r.warranty.rating < 3.5).map((r) => `${r.name}: khách chấm bảo hành ${r.warranty.rating}★`)
  ] : [];

  return (
    <div className="container-fluid">
      <h1 className="fs-4 fw-bold mb-1">Báo cáo nhân viên</h1>
      <div className="small text-muted mb-3">Hiệu suất bán hàng, giao hàng, bảo hành của {isAdmin ? 'toàn hệ thống' : 'các chi nhánh bạn quản lý'}. So sánh với kỳ trước cùng độ dài.</div>

      <PeriodPicker value={range} onChange={setRange}>
        {(user?.directReports > 0 || scope) && (
          <div className="btn-group btn-group-sm" role="group" aria-label="Phạm vi">
            <Button variant={scope === 'direct' ? 'primary' : 'outline-primary'} onClick={() => { setScope('direct'); setStoreId(''); }}>Báo cáo trực tiếp cho tôi ({user?.directReports || data?.directCount || 0})</Button>
            <Button variant={!scope ? 'primary' : 'outline-primary'} onClick={() => setScope('')}>{isAdmin ? 'Toàn hệ thống' : 'Tất cả trong phạm vi'}</Button>
          </div>
        )}
        {!scope && myStores.length > 1 && (
          <Form.Select size="sm" style={{ width: 'auto' }} value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Chi nhánh">
            <option value="">{isAdmin ? 'Tất cả chi nhánh' : 'Tất cả chi nhánh tôi quản lý'}</option>
            {myStores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Form.Select>
        )}
        {loading && <Spinner size="sm" />}
      </PeriodPicker>

      <Nav variant="tabs" activeKey={tab} onSelect={(k) => setParams(k === 'overview' ? {} : { tab: k })} className="mb-3">
        {TABS.map(([k, label, Icon]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k}><Icon className="me-1" />{label}{data && k !== 'overview' && <Badge bg="light" text="dark" className="ms-1 border">{byKind(k).length}</Badge>}</Nav.Link></Nav.Item>
        ))}
      </Nav>
      {error && <Alert variant="danger">{error}</Alert>}

      {data && tab === 'overview' && (
        <>
          <Row xs={2} md={4} xl={8} className="g-3 mb-3">
            <Col><Kpi label="Nhân sự" value={data.headcount.active} sub={`/${data.headcount.total} tài khoản`} /></Col>
            <Col><Kpi label="Doanh thu tại quầy" value={shortMoney(t.sales.revenue)} cur={t.sales.revenue} prev={p.sales.revenue} /></Col>
            <Col><Kpi label="Sản phẩm bán ra" value={t.sales.units} cur={t.sales.units} prev={p.sales.units} /></Col>
            <Col><Kpi label="Đơn giao thành công" value={t.delivery.delivered} cur={t.delivery.delivered} prev={p.delivery.delivered} /></Col>
            <Col><Kpi label="Điểm giao hàng" value={t.delivery.score ?? '—'} cur={t.delivery.score} prev={p.delivery.score} sub="★" /></Col>
            <Col><Kpi label="Phiếu BH hoàn tất" value={t.warranty.done} cur={t.warranty.done} prev={p.warranty.done} /></Col>
            <Col><Kpi label="BH đang tồn" value={t.warranty.inProgress} tone={t.warranty.inProgress > 30 ? 'warning' : ''} /></Col>
            <Col><Kpi label="Điểm bảo hành" value={t.warranty.rating ?? '—'} cur={t.warranty.rating} prev={p.warranty.rating} sub="★" /></Col>
          </Row>

          {stars.length > 0 && (
            <Row className="g-3 mb-3">
              {stars.map(([label, r, f, Icon]) => (
                <Col md={4} key={label}>
                  <Card as={Link} to={`/admin/staff-reports/${r._id}`} className="h-100 shadow-sm text-decoration-none border-warning-subtle">
                    <Card.Body className="d-flex align-items-center gap-3">
                      <div className="position-relative"><AdminThumb src={r.avatar} name={r.name} size={48} rounded /><Trophy className="position-absolute text-warning" style={{ right: -6, bottom: -4 }} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="small text-muted"><Icon className="me-1" />{label}</div>
                        <div className="fw-bold text-truncate text-body">{r.name}</div>
                        <div className="small text-primary">{f(r)}</div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          <Row className="g-3 mb-3">
            <Col lg={8}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">Sản lượng cả đội theo {bucket}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={labelOf} fontSize={11} />
                    <YAxis yAxisId="l" tickFormatter={shortMoney} fontSize={11} />
                    <YAxis yAxisId="r" orientation="right" allowDecimals={false} fontSize={11} />
                    <Tooltip labelFormatter={labelOf} formatter={(v, n) => (n === 'Doanh thu quầy' ? money(v) : v)} />
                    <Legend />
                    <Bar yAxisId="l" dataKey="revenue" name="Doanh thu quầy" fill="#0d6efd" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="r" dataKey="delivered" name="Đơn giao" stroke="#198754" strokeWidth={2} dot={false} />
                    <Line yAxisId="r" dataKey="ticketsDone" name="Phiếu BH xong" stroke="#6f42c1" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card.Body></Card>
            </Col>
            <Col lg={4}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">Cơ cấu nhân sự</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.headcount.byKind} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {data.headcount.byKind.map((k, i) => <Cell key={k.kind} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="d-flex flex-wrap gap-2 justify-content-center small">
                  {data.headcount.byKind.map((k, i) => <span key={k.kind}><span className="d-inline-block rounded-circle me-1" style={{ width: 8, height: 8, background: PIE[i % PIE.length] }} />{k.label} {k.count}</span>)}
                </div>
              </Card.Body></Card>
            </Col>
          </Row>

          <Card className="shadow-sm mb-3"><Card.Body>
            <div className="fw-semibold mb-2">⚠️ Cần quản lý chú ý</div>
            {alerts.length ? <ul className="small mb-0">{alerts.map((a) => <li key={a}>{a}</li>)}</ul> : <div className="small text-success">Không có vấn đề nổi bật trong kỳ này 👍</div>}
          </Card.Body></Card>
        </>
      )}

      {data && tab !== 'overview' && (
        <>
          <Row className="g-3 mb-3">
            <Col lg={7}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">{tab === 'sales' ? 'Doanh thu từng nhân viên' : tab === 'delivery' ? 'Đơn giao thành công / thất bại từng người' : 'Phiếu bảo hành hoàn tất / đang xử lý'}</div>
                <ResponsiveContainer width="100%" height={Math.max(200, byKind(tab).length * 28)}>
                  <BarChart data={byKind(tab).slice(0, 20)} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" tickFormatter={tab === 'sales' ? shortMoney : undefined} fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={130} fontSize={11} />
                    <Tooltip formatter={(v, n) => (n === 'Doanh thu' ? money(v) : v)} />
                    <Legend />
                    {tab === 'sales' && <Bar dataKey="sales.revenue" name="Doanh thu" fill="#0d6efd" radius={[0, 3, 3, 0]} />}
                    {tab === 'delivery' && <><Bar dataKey="delivery.delivered" name="Thành công" stackId="a" fill="#198754" /><Bar dataKey="delivery.failedTries" name="Thất bại" stackId="a" fill="#dc3545" radius={[0, 3, 3, 0]} /></>}
                    {tab === 'warranty' && <><Bar dataKey="warranty.done" name="Hoàn tất" stackId="a" fill="#6f42c1" /><Bar dataKey="warranty.inProgress" name="Đang xử lý" stackId="a" fill="#ffc107" radius={[0, 3, 3, 0]} /></>}
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body></Card>
            </Col>
            <Col lg={5}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">{tab === 'sales' ? 'Doanh thu' : tab === 'delivery' ? 'Đơn giao' : 'Phiếu hoàn tất'} cả nhóm theo {bucket}</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={labelOf} fontSize={11} />
                    <YAxis tickFormatter={tab === 'sales' ? shortMoney : undefined} allowDecimals={false} fontSize={11} />
                    <Tooltip labelFormatter={labelOf} formatter={(v) => (tab === 'sales' ? money(v) : v)} />
                    <Bar dataKey={tab === 'sales' ? 'revenue' : tab === 'delivery' ? 'delivered' : 'ticketsDone'} name={tab === 'sales' ? 'Doanh thu' : 'Số lượng'} fill={tab === 'sales' ? '#0d6efd' : tab === 'delivery' ? '#198754' : '#6f42c1'} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body></Card>
            </Col>
          </Row>
          <Card className="shadow-sm"><Card.Body>
            <div className="fw-semibold mb-2"><Trophy className="text-warning me-1" />Bảng xếp hạng <span className="small text-muted fw-normal">(bấm tiêu đề cột để sắp xếp)</span></div>
            <Leaderboard rows={byKind(tab)} kind={tab} />
          </Card.Body></Card>
        </>
      )}
    </div>
  );
}
