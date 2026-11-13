import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar } from 'recharts';
import { Card, Row, Col, Form, Spinner, Alert, Badge, Button, ProgressBar } from 'react-bootstrap';
import { HeartPulse, ExclamationTriangleFill, ExclamationCircleFill, InfoCircleFill, CheckCircleFill, ArrowLeft, Shop } from 'react-bootstrap-icons';
import api from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { PeriodPicker, Delta, money, shortMoney } from '../../components/admin/StaffReportView';

const LEVEL = {
  good: { label: 'Khỏe', color: '#198754', bg: 'success' },
  watch: { label: 'Cần theo dõi', color: '#e0a800', bg: 'warning' },
  alert: { label: 'Báo động', color: '#dc3545', bg: 'danger' },
  unknown: { label: 'Chưa đủ dữ liệu', color: '#adb5bd', bg: 'secondary' }
};
const SEV = { 3: [ExclamationTriangleFill, 'danger', 'Nghiêm trọng'], 2: [ExclamationCircleFill, 'warning', 'Cần xử lý'], 1: [InfoCircleFill, 'info', 'Lưu ý'] };
const COLORS = ['#0d6efd', '#dc3545', '#198754', '#fd7e14', '#6f42c1', '#20c997', '#6c757d'];
const labelOf = (key) => (key?.length === 10 ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : `T${Number(key?.slice(5, 7))}/${key?.slice(2, 4)}`);
const iso = (d) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);

function ScoreGauge({ score, level, size = 190, label }) {
  const L = LEVEL[level] || LEVEL.unknown;
  return (
    <div className="text-center" style={{ width: size, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height={size * 0.75}>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v: score ?? 0 }]} startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" cornerRadius={10} fill={L.color} background />
          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontSize={size / 4.2} fontWeight={800} fill={L.color}>{score ?? '—'}</text>
          <text x="50%" y="66%" textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.6}>/ 100 điểm</text>
        </RadialBarChart>
      </ResponsiveContainer>
      <Badge bg={L.bg} text={level === 'watch' ? 'dark' : undefined} className="fs-6 px-3">{L.label}</Badge>
      {label && <div className="small text-muted mt-1">{label}</div>}
    </div>
  );
}

function GroupBars({ groups }) {
  return (
    <div className="d-flex flex-column gap-2">
      {groups.map((g) => {
        const L = LEVEL[g.level] || LEVEL.unknown;
        return (
          <div key={g.key}>
            <div className="d-flex justify-content-between small"><span>{g.label} <span className="text-muted">({g.weight}%)</span></span><b style={{ color: L.color }}>{g.score ?? '—'}</b></div>
            <ProgressBar now={g.score ?? 0} variant={L.bg} style={{ height: 8 }} />
          </div>
        );
      })}
    </div>
  );
}

function Issues({ issues, withStore }) {
  if (!issues.length) return <div className="small text-success"><CheckCircleFill className="me-1" />Không có vấn đề nổi bật trong kỳ này</div>;
  return (
    <div className="d-flex flex-column gap-2">
      {issues.map((i, idx) => {
        const [Icon, tone, label] = SEV[i.severity] || SEV[1];
        return (
          <div key={idx} className={`health-issue border-start border-3 border-${tone} ps-2`}>
            <div className="small fw-semibold"><Icon className={`text-${tone} me-1`} />{withStore && i.store && <Badge bg="light" text="dark" className="border me-1 fw-normal">{i.store}</Badge>}{i.text}</div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>{label} · 👉 {i.action}</div>
          </div>
        );
      })}
    </div>
  );
}

function Kpis({ k }) {
  const items = [
    ['Doanh thu', money(k.revenue), k.revenue, k.revenuePrev],
    ['Số đơn', k.orders, k.orders, k.ordersPrev],
    ['Giá trị TB / đơn', money(k.aov), k.aov, k.aovPrev],
    ['Đánh giá', k.rating != null ? `${k.rating}★` : '—', k.rating, k.ratingPrev],
    ['Khách quay lại', k.repeatRate != null ? `${k.repeatRate}%` : '—'],
    ['Xác nhận đơn ≤ 2 giờ', k.confirmFastRate != null ? `${k.confirmFastRate}%` : '—'],
    ['Tỷ lệ hủy', k.cancelRate != null ? `${k.cancelRate}%` : '—'],
    ['Giao thành công lần đầu', k.firstTryRate != null ? `${k.firstTryRate}%` : '—'],
    ['Còn hàng', k.inStockRate != null ? `${k.inStockRate}%` : '—'],
    ['BH tồn > 7 ngày', k.warrantyOld],
    ['Nhân sự', k.staff],
    ['Doanh thu / nhân viên', shortMoney(k.revenuePerStaff)]
  ];
  return (
    <Row xs={2} md={4} xl={6} className="g-2">
      {items.map(([label, value, cur, prev]) => (
        <Col key={label}>
          <div className="border rounded-3 p-2 h-100 bg-body">
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{label}</div>
            <div className="fw-bold">{value}</div>
            {prev !== undefined && <Delta cur={cur} prev={prev} />}
          </div>
        </Col>
      ))}
    </Row>
  );
}

// BÁO CÁO SỨC KHỎE: 1 chi nhánh -> sức khỏe chi nhánh; nhiều chi nhánh -> sức khỏe TechShop + xếp hạng từng chi nhánh
export default function AdminStoreHealthPage() {
  const { user } = useAuth();
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 30 * 86400000)), to: '' });
  const [storeId, setStoreId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    api.get('/store-health', { params: { from: range.from || undefined, to: range.to || undefined, storeId: storeId || undefined } })
      .then((r) => live && setData(r.data.data))
      .catch((e) => live && setError(e.response?.data?.message || 'Không tải được báo cáo'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [range, storeId]);

  const company = data?.mode === 'company';
  const o = data?.overview;
  // Radar so sánh 6 nhóm giữa các chi nhánh
  const radar = useMemo(() => (data ? (data.stores[0]?.groups || []).map((g, i) => {
    const row = { group: g.label };
    data.stores.forEach((s) => { row[s.store.name] = s.groups[i].score ?? 0; });
    if (company) row.TechShop = o.groups[i].score ?? 0;
    return row;
  }) : []), [data, company, o]);
  const trend = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const t of data.trend) {
      const row = map.get(t.key) || { key: t.key };
      const name = data.stores.find((s) => String(s.store._id) === String(t.storeId))?.store.name;
      if (name) row[name] = t.revenue;
      map.set(t.key, row);
    }
    return [...map.values()];
  }, [data]);
  const allIssues = company ? data.stores.flatMap((s) => s.issues.map((i) => ({ ...i, store: s.store.name }))).sort((a, b) => b.severity - a.severity).slice(0, 12) : [];

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
        {storeId && data?.allowedStores?.length > 1 && <Button size="sm" variant="link" className="p-0" onClick={() => setStoreId('')}><ArrowLeft /> Toàn TechShop</Button>}
        <h1 className="fs-4 fw-bold mb-0"><HeartPulse className="text-danger me-2" />{company ? 'Sức khỏe TechShop' : `Sức khỏe chi nhánh ${data?.stores[0]?.store.name || ''}`}</h1>
      </div>
      <div className="small text-muted mb-3">Điểm 0-100 từ 6 nhóm: Doanh thu 25% · Khách hàng 25% · Vận hành 20% · Tồn kho 15% · Con người 10% · Rủi ro 5%. So sánh với kỳ trước cùng độ dài.</div>

      <PeriodPicker value={range} onChange={setRange}>
        {data?.allowedStores?.length > 1 && (
          <Form.Select size="sm" style={{ width: 'auto' }} value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Chi nhánh">
            <option value="">{user?.role === 'admin' ? 'Toàn TechShop' : 'Tất cả chi nhánh tôi quản lý'}</option>
            {data.allowedStores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Form.Select>
        )}
        {loading && <Spinner size="sm" />}
      </PeriodPicker>
      {error && <Alert variant="danger">{error}</Alert>}

      {o && (
        <>
          <Row className="g-3 mb-3">
            <Col lg={3} md={5}>
              <Card className="h-100 shadow-sm"><Card.Body className="d-flex flex-column justify-content-center">
                <ScoreGauge score={o.score} level={o.level} label={company ? `${data.stores.length} chi nhánh · ${data.range.days} ngày` : `${data.range.days} ngày gần nhất`} />
                {o.strengths.length > 0 && <div className="d-flex flex-wrap gap-1 justify-content-center mt-3">{o.strengths.map((s) => <Badge key={s} bg="success-subtle" text="success-emphasis" className="fw-normal">✓ {s}</Badge>)}</div>}
              </Card.Body></Card>
            </Col>
            <Col lg={4} md={7}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">Điểm theo nhóm</div>
                <GroupBars groups={o.groups} />
              </Card.Body></Card>
            </Col>
            <Col lg={5}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">{company ? 'Vấn đề cần xử lý (toàn hệ thống)' : 'Vấn đề cần xử lý'}</div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}><Issues issues={company ? allIssues : o.issues} withStore={company} /></div>
              </Card.Body></Card>
            </Col>
          </Row>

          <Card className="shadow-sm mb-3"><Card.Body>
            <div className="fw-semibold mb-2">Chỉ số chính {company ? 'của TechShop' : ''}</div>
            <Kpis k={o.kpi} />
          </Card.Body></Card>

          {company && (
            <>
              <div className="fw-semibold mb-2"><Shop className="me-1" />Xếp hạng sức khỏe chi nhánh</div>
              <Row xs={1} md={2} xl={3} className="g-3 mb-3">
                {data.stores.map((s, i) => {
                  const L = LEVEL[s.level] || LEVEL.unknown;
                  return (
                    <Col key={s.store._id}>
                      <Card className="h-100 shadow-sm health-store" style={{ borderTop: `4px solid ${L.color}` }} role="button" onClick={() => setStoreId(String(s.store._id))}>
                        <Card.Body>
                          <div className="d-flex align-items-center gap-3">
                            <div className="health-rank">{i + 1}</div>
                            <div className="flex-grow-1 min-w-0">
                              <div className="fw-semibold text-truncate">{s.store.name}</div>
                              <Badge bg={L.bg} text={s.level === 'watch' ? 'dark' : undefined}>{L.label}</Badge>
                            </div>
                            <div className="text-end"><div className="fs-3 fw-bold lh-1" style={{ color: L.color }}>{s.score ?? '—'}</div><div className="text-muted" style={{ fontSize: '0.7rem' }}>điểm</div></div>
                          </div>
                          <div className="d-flex flex-wrap gap-1 my-2">
                            {s.groups.map((g) => <span key={g.key} className={`badge bg-${(LEVEL[g.level] || LEVEL.unknown).bg}-subtle text-${(LEVEL[g.level] || LEVEL.unknown).bg}-emphasis fw-normal`}>{g.label} {g.score ?? '—'}</span>)}
                          </div>
                          <div className="small text-muted">Doanh thu {shortMoney(s.kpi.revenue)} <Delta cur={s.kpi.revenue} prev={s.kpi.revenuePrev} /> · {s.kpi.rating ?? '—'}★</div>
                          {s.issues[0] && <div className="small text-danger mt-1 text-truncate">⚠ {s.issues[0].text}{s.issues.length > 1 ? ` (+${s.issues.length - 1})` : ''}</div>}
                          <div className="small text-primary mt-1">Xem chi tiết →</div>
                        </Card.Body>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </>
          )}

          <Row className="g-3">
            <Col lg={company ? 6 : 5}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">{company ? 'So sánh 6 nhóm giữa các chi nhánh' : 'Điểm 6 nhóm'}</div>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radar} outerRadius="72%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="group" fontSize={12} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    {data.stores.map((s, i) => <Radar key={s.store._id} name={s.store.name} dataKey={s.store.name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={company ? 0.08 : 0.3} />)}
                    <Tooltip />
                    {company && <Legend />}
                  </RadarChart>
                </ResponsiveContainer>
              </Card.Body></Card>
            </Col>
            <Col lg={company ? 6 : 7}>
              <Card className="h-100 shadow-sm"><Card.Body>
                <div className="fw-semibold mb-2">Doanh thu theo {data.range.days <= 62 ? 'ngày' : 'tháng'}</div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="key" tickFormatter={labelOf} fontSize={11} />
                    <YAxis tickFormatter={shortMoney} fontSize={11} />
                    <Tooltip labelFormatter={labelOf} formatter={(v) => money(v)} />
                    <Legend />
                    {data.stores.map((s, i) => <Line key={s.store._id} dataKey={s.store.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </Card.Body></Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
