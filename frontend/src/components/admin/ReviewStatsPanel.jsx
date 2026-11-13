import { useEffect, useState } from 'react';
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { Card, Row, Col, Form, Spinner, Alert, Table, Badge, Button } from 'react-bootstrap';
import { StarFill, Truck, PersonBadge } from 'react-bootstrap-icons';
import { reviewService } from '../../services/reviewService';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import AdminThumb from './AdminThumb';

const STAR_COLORS = { 5: '#198754', 4: '#20c997', 3: '#ffc107', 2: '#fd7e14', 1: '#dc3545' };
const scoreColor = (v) => (v == null ? '#adb5bd' : v >= 4.5 ? '#198754' : v >= 4 ? '#20c997' : v >= 3 ? '#ffc107' : '#dc3545');

function Kpi({ label, value, sub, tone }) {
  return (
    <Card className="h-100 shadow-sm">
      <Card.Body className="py-3">
        <div className="small text-muted">{label}</div>
        <div className={`fs-4 fw-bold ${tone ? `text-${tone}` : ''}`}>{value}</div>
        {sub && <div className="small text-muted">{sub}</div>}
      </Card.Body>
    </Card>
  );
}

// Bảng xếp hạng người giao hàng (nhân viên / đơn vị vận chuyển). Điểm giao hàng = tiêu chí "Tốc độ giao hàng", không có thì lấy điểm chung
function DeliveryTable({ rows, empty, carrier }) {
  if (!rows.length) return <div className="small text-muted">{empty}</div>;
  return (
    <Table size="sm" hover className="mb-0 small align-middle">
      <thead><tr className="text-muted"><th>{carrier ? 'Đơn vị' : 'Nhân viên'}</th><th className="text-end">Điểm GH</th><th className="text-end d-none d-md-table-cell">Phục vụ</th><th className="text-end">Đánh giá</th><th className="text-end">Khen / Chê</th></tr></thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.id}>
            <td>
              <div className="d-flex align-items-center gap-2">
                {carrier ? <Truck className="text-muted" /> : <AdminThumb src={x.avatar} name={x.name} size={24} rounded />}
                <span className="text-truncate" style={{ maxWidth: 170 }}>{x.name}</span>
              </div>
            </td>
            <td className="text-end"><b style={{ color: scoreColor(x.score) }}>{x.score}★</b></td>
            <td className="text-end d-none d-md-table-cell">{x.service != null ? x.service + '★' : '-'}</td>
            <td className="text-end text-muted">{x.count}{x.low > 0 && <span className="text-danger"> · {x.low} xấu</span>}</td>
            <td className="text-end text-nowrap"><span className="text-success">{x.praise}</span> / <span className={x.complaints ? 'text-danger fw-semibold' : 'text-muted'}>{x.complaints}</span></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// Tab "Tổng quan" trên trang Quản lý đánh giá: số liệu + biểu đồ. onDrill(filters) chuyển sang tab danh sách đã lọc sẵn.
export default function ReviewStatsPanel({ onDrill }) {
  const { user } = useAuth();
  const scoped = user?.role === 'staff' && Boolean(user?.storeId);
  const [range, setRange] = useState({ from: '', to: '', storeId: '' });
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!scoped) storeService.getStores().then(setStores).catch(() => {}); }, [scoped]);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    reviewService.getStats({ from: range.from || undefined, to: range.to || undefined, storeId: range.storeId || undefined })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.response?.data?.message || 'Không tải được thống kê'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [range]);

  const preset = (days) => {
    if (!days) return setRange((r) => ({ ...r, from: '', to: '' }));
    const d = new Date(Date.now() - days * 86400000);
    setRange((r) => ({ ...r, from: d.toISOString().slice(0, 10), to: '' }));
  };

  return (
    <div>
      {/* Bộ lọc */}
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div className="btn-group btn-group-sm" role="group">
          {[[0, 'Tất cả'], [30, '30 ngày'], [90, '90 ngày'], [365, '12 tháng']].map(([d, l]) => (
            <Button key={d} variant="outline-secondary" onClick={() => preset(d)}>{l}</Button>
          ))}
        </div>
        <Form.Control type="date" size="sm" style={{ width: 'auto' }} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="Từ ngày" />
        <span className="small text-muted pb-1">→</span>
        <Form.Control type="date" size="sm" style={{ width: 'auto' }} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="Đến ngày" />
        {!scoped && (
          <Form.Select size="sm" style={{ width: 'auto' }} value={range.storeId} onChange={(e) => setRange({ ...range, storeId: e.target.value })} aria-label="Chi nhánh">
            <option value="">Tất cả chi nhánh</option>
            {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Form.Select>
        )}
        {loading && <Spinner size="sm" className="ms-2" />}
      </div>
      {scoped && <div className="small text-muted mb-2">Số liệu chi nhánh {user.storeId?.name || 'của bạn'}.</div>}
      {error && <Alert variant="danger">{error}</Alert>}

      {data && (
        <>
          <Row xs={2} md={3} xl={6} className="g-3 mb-3">
            <Col><Kpi label="Tổng đánh giá" value={data.total} /></Col>
            <Col><Kpi label="Điểm trung bình" value={<>{data.average} <StarFill className="text-warning" size={18} /></>} /></Col>
            <Col><Kpi label="Hài lòng (4-5★)" value={`${data.satisfiedRate}%`} tone={data.satisfiedRate >= 80 ? 'success' : 'warning'} /></Col>
            <Col>
              <Card role="button" className="h-100 shadow-sm" onClick={() => onDrill({ replied: 'false' })}>
                <Card.Body className="py-3"><div className="small text-muted">Chưa phản hồi</div><div className={`fs-4 fw-bold ${data.unreplied ? 'text-danger' : ''}`}>{data.unreplied}</div><div className="small text-primary">Xem & trả lời →</div></Card.Body>
              </Card>
            </Col>
            <Col>
              <Card role="button" className="h-100 shadow-sm" onClick={() => onDrill({ negative: 'true' })}>
                <Card.Body className="py-3"><div className="small text-muted">Có thẻ chê</div><div className={`fs-4 fw-bold ${data.negativeCount ? 'text-danger' : ''}`}>{data.negativeCount}</div><div className="small text-primary">Xử lý khiếu nại →</div></Card.Body>
              </Card>
            </Col>
            <Col><Kpi label="Có hình ảnh" value={`${data.withImagesRate}%`} /></Col>
          </Row>

          {data.total === 0 ? <Alert variant="light" className="border">Chưa có đánh giá trong khoảng thời gian này.</Alert> : (
            <>
              <Row className="g-3 mb-3">
                <Col lg={8}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Số đánh giá & điểm trung bình theo tháng</div>
                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={data.months}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis yAxisId="l" allowDecimals={false} fontSize={12} />
                        <YAxis yAxisId="r" orientation="right" domain={[0, 5]} fontSize={12} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="l" dataKey="count" name="Số đánh giá" fill="#0d6efd" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="r" dataKey="average" name="Điểm TB" stroke="#fd7e14" strokeWidth={2} dot />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Card.Body></Card>
                </Col>
                <Col lg={4}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Phân bố số sao <span className="small text-muted fw-normal">(bấm để xem)</span></div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data.stars} layout="vertical" margin={{ left: 0 }}>
                        <XAxis type="number" allowDecimals={false} fontSize={12} />
                        <YAxis type="category" dataKey="star" tickFormatter={(s) => `${s}★`} width={36} fontSize={12} />
                        <Tooltip formatter={(v) => [v, 'Đánh giá']} labelFormatter={(s) => `${s} sao`} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => onDrill({ rating: String(d.star) })}>
                          {data.stars.map((s) => <Cell key={s.star} fill={STAR_COLORS[s.star]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card.Body></Card>
                </Col>
              </Row>

              <Row className="g-3 mb-3">
                <Col lg={6}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Điểm theo tiêu chí <span className="small text-muted fw-normal">(khâu nào yếu nhất?)</span></div>
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={data.criteria} layout="vertical" margin={{ left: 10 }}>
                        <XAxis type="number" domain={[0, 5]} fontSize={12} />
                        <YAxis type="category" dataKey="label" width={130} fontSize={12} />
                        <Tooltip formatter={(v) => [v ?? 'Chưa có', 'Điểm TB']} />
                        <Bar dataKey="average" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 12 }}>
                          {data.criteria.map((c) => <Cell key={c.key} fill={scoreColor(c.average)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card.Body></Card>
                </Col>
                <Col lg={6}>
                  <Card className="h-100 shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2">Khách nói gì nhiều nhất?</div>
                    <Row>
                      {[['positive', 'Khen', 'success'], ['negative', 'Chê', 'danger']].map(([k, title, tone]) => {
                        const list = data.tags[k];
                        const max = Math.max(1, ...list.map((t) => t.count));
                        return (
                          <Col key={k} sm={6} className="mb-2">
                            <div className={`small fw-semibold text-${tone} mb-2`}>{title}</div>
                            {list.length === 0 && <div className="small text-muted">Chưa có</div>}
                            {list.map((t) => (
                              <div key={t.tag} className="small mb-2">
                                <div className="d-flex justify-content-between"><span>{t.tag}</span><b>{t.count}</b></div>
                                <div className="bg-body-secondary rounded" style={{ height: 6 }}>
                                  <div className={`bg-${tone} rounded`} style={{ height: 6, width: `${(t.count / max) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </Col>
                        );
                      })}
                    </Row>
                  </Card.Body></Card>
                </Col>
              </Row>

              <div className="fw-semibold mt-4 mb-2 d-flex align-items-center gap-2"><Truck /> Đánh giá giao hàng</div>
              <Row className="g-3 mb-3">
                <Col lg={6}>
                  <Card className="h-100 shadow-sm border-success-subtle"><Card.Body>
                    <div className="fw-semibold mb-2 text-success"><PersonBadge className="me-1" />Nhân viên giao hàng được đánh giá cao</div>
                    <DeliveryTable rows={data.topShippers} empty="Chưa có nhân viên nào đạt từ 4★" />
                  </Card.Body></Card>
                </Col>
                <Col lg={6}>
                  <Card className="h-100 shadow-sm border-danger-subtle"><Card.Body>
                    <div className="fw-semibold mb-2 text-danger"><PersonBadge className="me-1" />Nhân viên giao hàng bị đánh giá thấp (dưới 4★)</div>
                    <DeliveryTable rows={data.lowShippers} empty="Không có nhân viên nào dưới 4★ 👍" />
                  </Card.Body></Card>
                </Col>
                <Col xs={12}>
                  <Card className="shadow-sm"><Card.Body>
                    <div className="fw-semibold mb-2"><Truck className="me-1" />Đơn vị giao hàng (đơn gửi qua đơn vị vận chuyển bên ngoài)</div>
                    <DeliveryTable rows={data.carriers} carrier empty="Chưa có đánh giá nào cho đơn giao qua đơn vị vận chuyển" />
                  </Card.Body></Card>
                </Col>
              </Row>
              <div className="small text-muted mb-3">Điểm GH = điểm "Tốc độ giao hàng" khách chấm (nếu khách không chấm tiêu chí này thì dùng điểm chung). Khen / Chê: số lần khách chọn thẻ về giao hàng, đóng gói, nhân viên.</div>

              <Row className="g-3">
                {[['worstProducts', 'Sản phẩm cần chú ý', 'Chưa có sản phẩm nào dưới 4★ (cần ≥ 2 đánh giá)'], ['bestProducts', 'Sản phẩm được khen nhiều', 'Chưa đủ dữ liệu']].map(([key, title, empty]) => (
                  <Col lg={!scoped && data.stores.length > 1 ? 4 : 6} key={key}>
                    <Card className="h-100 shadow-sm"><Card.Body>
                      <div className="fw-semibold mb-2">{title}</div>
                      {data[key].length === 0 ? <div className="small text-muted">{empty}</div> : (
                        <Table size="sm" hover className="mb-0 small align-middle">
                          <tbody>
                            {data[key].map((p) => (
                              <tr key={p.productId} role="button" onClick={() => onDrill({ productId: p.productId })}>
                                <td style={{ width: 40 }}><AdminThumb src={p.image} alt={p.title} size={32} /></td>
                                <td className="text-truncate" style={{ maxWidth: 180 }}>{p.title}</td>
                                <td className="text-end text-nowrap"><Badge bg="light" text="dark" className="border" style={{ color: scoreColor(p.average) }}>{p.average}★</Badge></td>
                                <td className="text-end text-muted text-nowrap">{p.count} đg{p.low > 0 && <span className="text-danger"> · {p.low} xấu</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                    </Card.Body></Card>
                  </Col>
                ))}
                {!scoped && data.stores.length > 1 && (
                  <Col lg={4}>
                    <Card className="h-100 shadow-sm"><Card.Body>
                      <div className="fw-semibold mb-2">Điểm theo chi nhánh</div>
                      <Table size="sm" className="mb-0 small">
                        <tbody>
                          {data.stores.map((s) => (
                            <tr key={s.storeId} role="button" onClick={() => setRange({ ...range, storeId: s.storeId })}>
                              <td>{s.name}</td>
                              <td className="text-end"><b style={{ color: scoreColor(s.average) }}>{s.average}★</b></td>
                              <td className="text-end text-muted">{s.count} đg</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </Card.Body></Card>
                  </Col>
                )}
              </Row>
            </>
          )}
        </>
      )}
    </div>
  );
}
