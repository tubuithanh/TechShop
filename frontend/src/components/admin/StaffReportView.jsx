import { useEffect, useState } from 'react';
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card, Row, Col, Button, Form, Badge, Spinner, Alert, Table } from 'react-bootstrap';
import { ArrowUpShort, ArrowDownShort, Trophy, StarFill, Truck, Cart3, Tools, ChatQuote } from 'react-bootstrap-icons';
import AdminThumb from './AdminThumb';

export const money = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
export const shortMoney = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${Math.round(v / 1e6)} tr` : (v || 0).toLocaleString('vi-VN'));
const KIND_ICON = { sales: Cart3, delivery: Truck, warranty: Tools };

// ---------- Chọn kỳ báo cáo ----------
const iso = (d) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function periodPresets() {
  const now = new Date(Date.now() + 7 * 3600000);
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  const d = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd) - 7 * 3600000);
  const q = Math.floor(m / 3);
  return [
    ['month', 'Tháng này', { from: iso(d(y, m, 1)), to: '' }],
    ['lastMonth', 'Tháng trước', { from: iso(d(y, m - 1, 1)), to: iso(d(y, m, 0)) }],
    ['quarter', 'Quý này', { from: iso(d(y, q * 3, 1)), to: '' }],
    ['year', 'Năm nay', { from: iso(d(y, 0, 1)), to: '' }],
    ['12m', '12 tháng', { from: iso(d(y, m - 11, 1)), to: '' }]
  ];
}
export function PeriodPicker({ value, onChange, children }) {
  const presets = periodPresets();
  const active = presets.find(([, , r]) => r.from === value.from && r.to === value.to)?.[0];
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Kỳ báo cáo">
        {presets.map(([k, label, r]) => <Button key={k} variant={active === k ? 'primary' : 'outline-secondary'} onClick={() => onChange(r)}>{label}</Button>)}
      </div>
      <Form.Control type="date" size="sm" style={{ width: 'auto' }} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="Từ ngày" />
      <span className="small text-muted">→</span>
      <Form.Control type="date" size="sm" style={{ width: 'auto' }} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="Đến ngày" />
      {children}
    </div>
  );
}

// ---------- Thẻ số liệu có so sánh kỳ trước ----------
export function Delta({ cur, prev, inverse }) {
  if (prev == null || cur == null || (!prev && !cur)) return null;
  if (!prev) return <span className="small text-success">mới</span>;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (!pct) return <span className="small text-muted">= kỳ trước</span>;
  const good = inverse ? pct < 0 : pct > 0;
  return (
    <span className={`small ${good ? 'text-success' : 'text-danger'}`} title="So với kỳ trước">
      {pct > 0 ? <ArrowUpShort /> : <ArrowDownShort />}{Math.abs(pct)}%
    </span>
  );
}
export function Kpi({ label, value, cur, prev, inverse, sub, tone }) {
  return (
    <Card className="h-100 shadow-sm">
      <Card.Body className="py-3">
        <div className="small text-muted">{label}</div>
        <div className={`fs-5 fw-bold ${tone ? `text-${tone}` : ''}`}>{value}</div>
        <div className="d-flex gap-2 align-items-center"><Delta cur={cur} prev={prev} inverse={inverse} />{sub && <span className="small text-muted">{sub}</span>}</div>
      </Card.Body>
    </Card>
  );
}
const stars = (v) => (v == null ? '—' : <>{v} <StarFill size={12} className="text-warning" /></>);
const labelOf = (key) => (key?.length === 10 ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : `T${Number(key?.slice(5, 7))}/${key?.slice(2, 4)}`);

// Vòng tròn % (tỷ lệ thành công, hoàn tất...)
function Gauge({ value, label, color }) {
  return (
    <div className="text-center">
      <ResponsiveContainer width="100%" height={120}>
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ v: value ?? 0 }]} startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" cornerRadius={8} fill={color} background />
          <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="fw-bold" fontSize={22} fill="currentColor">{value == null ? '—' : `${value}%`}</text>
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="small text-muted" style={{ marginTop: -18 }}>{label}</div>
    </div>
  );
}

function Feedback({ list, empty }) {
  if (!list?.length) return <div className="small text-muted">{empty}</div>;
  return (
    <div className="d-flex flex-column gap-2">
      {list.map((f, i) => (
        <div key={i} className="border-bottom pb-2 small">
          <div className="d-flex justify-content-between"><span className="text-warning">{'★'.repeat(f.rating || 0)}<span className="text-body-tertiary">{'★'.repeat(5 - (f.rating || 0))}</span></span><span className="text-muted">{f.createdAt ? new Date(f.createdAt).toLocaleDateString('vi-VN') : ''}</span></div>
          {f.tags?.length > 0 && <div className="d-flex flex-wrap gap-1 my-1">{f.tags.map((t) => <Badge key={t} bg="light" text="dark" className="border fw-normal">{t}</Badge>)}</div>}
          {f.message && <div className="text-secondary">“{f.message}”{f.name && <span className="text-muted"> — {f.name}</span>}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------- Báo cáo 1 nhân viên (dùng cho "Báo cáo của tôi" và quản lý xem từng người) ----------
export default function StaffReportView({ load, title }) {
  const [range, setRange] = useState(periodPresets()[0][2]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    load({ from: range.from || undefined, to: range.to || undefined })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.response?.data?.message || 'Không tải được báo cáo'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [range, load]);

  const s = data?.staff;
  const m = data?.metrics; const p = data?.prev; const avg = data?.storeAverage;
  const kind = s?.kind;
  const Icon = KIND_ICON[kind] || Trophy;
  // Hiện khối nào: theo vai trò, cộng thêm khối khác nếu người đó có làm
  const show = {
    sales: kind === 'sales' || kind === 'manager' || m?.sales.orders > 0 || m?.sales.onlineConfirmed > 0,
    delivery: kind === 'delivery' || m?.delivery.assigned > 0,
    warranty: kind === 'warranty' || m?.warranty.tickets > 0 || m?.warranty.extensions > 0
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
        {s && <AdminThumb src={s.avatar} name={s.name} size={52} rounded />}
        <div className="flex-grow-1">
          <h1 className="fs-4 fw-bold mb-0">{title || s?.name || 'Báo cáo nhân viên'}</h1>
          {s && <div className="small text-muted"><Icon className="me-1" />{s.title || s.kindLabel} · {s.store || 'Chưa gắn chi nhánh'}{s.manager && <> · Báo cáo cho <b>{s.manager.name}</b></>}</div>}
        </div>
        {data?.rank && (
          <div className="d-flex gap-2">
            <Card className="text-center px-3 py-2 border-warning-subtle bg-warning-subtle">
              <div className="small text-muted">Hạng trong chi nhánh</div>
              <div className="fw-bold fs-5"><Trophy className="text-warning me-1" />{data.rank.store.rank ?? '—'}<span className="small text-muted">/{data.rank.store.of}</span></div>
            </Card>
            <Card className="text-center px-3 py-2">
              <div className="small text-muted">Hạng toàn hệ thống</div>
              <div className="fw-bold fs-5">{data.rank.company.rank ?? '—'}<span className="small text-muted">/{data.rank.company.of}</span></div>
            </Card>
          </div>
        )}
      </div>

      <PeriodPicker value={range} onChange={setRange}>{loading && <Spinner size="sm" />}</PeriodPicker>
      {error && <Alert variant="danger">{error}</Alert>}

      {data && (
        <>
          {/* BÁN HÀNG */}
          {show.sales && (
            <section className="mb-4">
              <h2 className="fs-6 fw-bold text-uppercase text-muted mb-2"><Cart3 className="me-1" />Bán hàng</h2>
              <Row xs={2} md={3} xl={6} className="g-3 mb-3">
                <Col><Kpi label="Doanh thu tại quầy" value={money(m.sales.revenue)} cur={m.sales.revenue} prev={p.sales.revenue} sub={avg && `TB chi nhánh ${shortMoney(avg.sales.revenue)}`} /></Col>
                <Col><Kpi label="Số đơn bán" value={m.sales.orders} cur={m.sales.orders} prev={p.sales.orders} /></Col>
                <Col><Kpi label="Sản phẩm bán ra" value={m.sales.units} cur={m.sales.units} prev={p.sales.units} /></Col>
                <Col><Kpi label="Giá trị TB / đơn" value={money(m.sales.avgOrder)} cur={m.sales.avgOrder} prev={p.sales.avgOrder} /></Col>
                <Col><Kpi label="Đơn online đã xác nhận" value={m.sales.onlineConfirmed} cur={m.sales.onlineConfirmed} prev={p.sales.onlineConfirmed} /></Col>
                <Col><Kpi label="Khách đánh giá" value={stars(m.sales.rating)} sub={`${m.sales.reviews} lượt`} /></Col>
              </Row>
              <Row className="g-3">
                <Col lg={8}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Doanh thu & số đơn theo {data.range.bucket === 'day' ? 'ngày' : 'tháng'}</div>
                    <ResponsiveContainer width="100%" height={240}>
                      <ComposedChart data={data.series}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="key" tickFormatter={labelOf} fontSize={11} />
                        <YAxis yAxisId="l" tickFormatter={shortMoney} fontSize={11} />
                        <YAxis yAxisId="r" orientation="right" allowDecimals={false} fontSize={11} />
                        <Tooltip labelFormatter={labelOf} formatter={(v, n) => (n === 'Doanh thu' ? money(v) : v)} />
                        <Legend />
                        <Bar yAxisId="l" dataKey="revenue" name="Doanh thu" fill="#0d6efd" radius={[3, 3, 0, 0]} />
                        <Line yAxisId="r" dataKey="orders" name="Số đơn" stroke="#fd7e14" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Card.Body></Card>
                </Col>
                <Col lg={4}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Sản phẩm bán chạy của bạn</div>
                    {data.topProducts?.length ? (
                      <Table size="sm" className="small mb-0 align-middle"><tbody>
                        {data.topProducts.map((x) => (
                          <tr key={x.productId}><td style={{ width: 36 }}><AdminThumb src={x.image} alt={x.name} size={28} /></td><td className="text-truncate" style={{ maxWidth: 150 }}>{x.name}</td><td className="text-end text-nowrap">{x.units} sp</td><td className="text-end text-nowrap fw-medium">{shortMoney(x.revenue)}</td></tr>
                        ))}
                      </tbody></Table>
                    ) : <div className="small text-muted">Chưa có đơn bán trong kỳ</div>}
                  </Card.Body></Card>
                </Col>
              </Row>
            </section>
          )}

          {/* GIAO HÀNG */}
          {show.delivery && (
            <section className="mb-4">
              <h2 className="fs-6 fw-bold text-uppercase text-muted mb-2"><Truck className="me-1" />Giao hàng</h2>
              <Row xs={2} md={3} xl={6} className="g-3 mb-3">
                <Col><Kpi label="Giao thành công" value={m.delivery.delivered} cur={m.delivery.delivered} prev={p.delivery.delivered} sub={avg && `TB chi nhánh ${avg.delivery.delivered}`} /></Col>
                <Col><Kpi label="Được phân công" value={m.delivery.assigned} cur={m.delivery.assigned} prev={p.delivery.assigned} sub={m.delivery.pending ? `${m.delivery.pending} đang giao` : ''} /></Col>
                <Col><Kpi label="Lần giao thất bại" value={m.delivery.failedTries} cur={m.delivery.failedTries} prev={p.delivery.failedTries} inverse tone={m.delivery.failedTries ? 'danger' : ''} /></Col>
                <Col><Kpi label="Thời gian giao TB" value={m.delivery.avgHours != null ? `${m.delivery.avgHours} giờ` : '—'} cur={m.delivery.avgHours} prev={p.delivery.avgHours} inverse /></Col>
                <Col><Kpi label="Tiền COD đã thu" value={money(m.delivery.cod)} cur={m.delivery.cod} prev={p.delivery.cod} /></Col>
                <Col><Kpi label="Điểm giao hàng" value={stars(m.delivery.score)} cur={m.delivery.score} prev={p.delivery.score} sub={`${m.delivery.reviews} đánh giá`} /></Col>
              </Row>
              <Row className="g-3">
                <Col lg={3} md={4}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <Gauge value={m.delivery.successRate} label="Tỷ lệ giao thành công" color="#198754" />
                    <div className="d-flex justify-content-around small mt-3">
                      <span className="text-success">👍 {m.delivery.praise} lời khen</span>
                      <span className={m.delivery.complaints ? 'text-danger' : 'text-muted'}>👎 {m.delivery.complaints} phàn nàn</span>
                    </div>
                  </Card.Body></Card>
                </Col>
                <Col lg={5} md={8}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Đơn giao theo {data.range.bucket === 'day' ? 'ngày' : 'tháng'}</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.series}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="key" tickFormatter={labelOf} fontSize={11} />
                        <YAxis allowDecimals={false} fontSize={11} />
                        <Tooltip labelFormatter={labelOf} />
                        <Legend />
                        <Bar dataKey="delivered" name="Thành công" stackId="a" fill="#198754" />
                        <Bar dataKey="failed" name="Thất bại" stackId="a" fill="#dc3545" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card.Body></Card>
                </Col>
                <Col lg={4}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2"><ChatQuote className="me-1" />Khách nói gì về bạn</div>
                    <Feedback list={data.feedback?.delivery} empty="Chưa có nhận xét" />
                  </Card.Body></Card>
                </Col>
              </Row>
            </section>
          )}

          {/* BẢO HÀNH */}
          {show.warranty && (
            <section className="mb-4">
              <h2 className="fs-6 fw-bold text-uppercase text-muted mb-2"><Tools className="me-1" />Bảo hành & sửa chữa</h2>
              <Row xs={2} md={3} xl={6} className="g-3 mb-3">
                <Col><Kpi label="Phiếu tiếp nhận / xử lý" value={m.warranty.tickets} cur={m.warranty.tickets} prev={p.warranty.tickets} /></Col>
                <Col><Kpi label="Đã hoàn tất" value={m.warranty.done} cur={m.warranty.done} prev={p.warranty.done} sub={avg && `TB chi nhánh ${avg.warranty.done}`} /></Col>
                <Col><Kpi label="Đang xử lý" value={m.warranty.inProgress} tone={m.warranty.inProgress > 10 ? 'warning' : ''} /></Col>
                <Col><Kpi label="Thời gian xử lý TB" value={m.warranty.avgDays != null ? `${m.warranty.avgDays} ngày` : '—'} cur={m.warranty.avgDays} prev={p.warranty.avgDays} inverse /></Col>
                <Col><Kpi label="Doanh thu sửa chữa + gia hạn" value={money(m.warranty.revenue + m.warranty.extensionRevenue)} cur={m.warranty.revenue + m.warranty.extensionRevenue} prev={p.warranty.revenue + p.warranty.extensionRevenue} sub={`${m.warranty.extensions} gói gia hạn`} /></Col>
                <Col><Kpi label="Khách đánh giá" value={stars(m.warranty.rating)} cur={m.warranty.rating} prev={p.warranty.rating} sub={`${m.warranty.reviews} lượt`} /></Col>
              </Row>
              <Row className="g-3">
                <Col lg={3} md={4}><Card className="h-100 shadow-sm"><Card.Body><Gauge value={m.warranty.doneRate} label="Tỷ lệ hoàn tất" color="#6f42c1" /></Card.Body></Card></Col>
                <Col lg={5} md={8}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Phiếu bảo hành theo {data.range.bucket === 'day' ? 'ngày' : 'tháng'}</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={data.series}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="key" tickFormatter={labelOf} fontSize={11} />
                        <YAxis allowDecimals={false} fontSize={11} />
                        <Tooltip labelFormatter={labelOf} />
                        <Legend />
                        <Bar dataKey="tickets" name="Tiếp nhận" fill="#adb5bd" radius={[3, 3, 0, 0]} />
                        <Line dataKey="ticketsDone" name="Hoàn tất" stroke="#6f42c1" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Card.Body></Card>
                </Col>
                <Col lg={4}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2"><ChatQuote className="me-1" />Phản hồi của khách</div>
                    <Feedback list={data.feedback?.warranty} empty="Chưa có phản hồi" />
                  </Card.Body></Card>
                </Col>
              </Row>
            </section>
          )}

          {show.sales && data.feedback?.sales?.length > 0 && (
            <Card className="shadow-sm mb-4"><Card.Body>
              <div className="fw-semibold mb-2"><ChatQuote className="me-1" />Khách mua tại quầy nhận xét</div>
              <Feedback list={data.feedback.sales} />
            </Card.Body></Card>
          )}
          {!show.sales && !show.delivery && !show.warranty && <Alert variant="light" className="border">Chưa có hoạt động nào trong kỳ này.</Alert>}
        </>
      )}
    </div>
  );
}
