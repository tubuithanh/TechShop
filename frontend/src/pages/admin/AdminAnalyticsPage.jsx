import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { Card, Row, Col, Table, Form, Button, Spinner, Alert, ProgressBar } from 'react-bootstrap';
import { ArrowUpShort, ArrowDownShort, Trophy } from 'react-bootstrap-icons';
import { dashboardService } from '../../services/dashboardService';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import { placeholderImage } from '../../utils/placeholderImage';

// ---------- Tiện ích định dạng ----------
const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const shortVND = (v) => {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)} tỷ`;
  if (Math.abs(v) >= 1e6) return `${Math.round(v / 1e6)}tr`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
};
const monthLabel = (key) => { const [y, m] = key.split('-'); return `T${Number(m)}/${y.slice(2)}`; };
const toInput = (d) => d.toISOString().slice(0, 10);

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569', '#0d9488', '#9333ea'];
const PAYMENT_LABELS = { cod: 'COD', cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', vnpay: 'VNPay', momo: 'MoMo' };
const DAYS = [{ d: 2, label: 'T2' }, { d: 3, label: 'T3' }, { d: 4, label: 'T4' }, { d: 5, label: 'T5' }, { d: 6, label: 'T6' }, { d: 7, label: 'T7' }, { d: 1, label: 'CN' }];
const RANK = ['#f59e0b', '#94a3b8', '#b45309'];
const tooltipStyle = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' };

// Mốc thời gian nhanh
function preset(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const local = (yy, mm, dd) => toInput(new Date(Date.UTC(yy, mm, dd)));
  switch (key) {
    case 'thisMonth': return { from: local(y, m, 1), to: local(y, m, now.getDate()) };
    case 'lastMonth': return { from: local(y, m - 1, 1), to: local(y, m, 0) };
    case '3m': return { from: local(y, m - 2, 1), to: local(y, m, now.getDate()) };
    case 'thisYear': return { from: local(y, 0, 1), to: local(y, m, now.getDate()) };
    default: return { from: local(y, m - 11, 1), to: local(y, m, now.getDate()) }; // 12 tháng
  }
}

// ---------- Khối giao diện dùng chung ----------
function Section({ title, subtitle, children, right }) {
  return (
    <Card className="shadow-sm h-100 border-0 rounded-4">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div>
            <h3 className="fw-bold fs-6 mb-0 border-start border-4 border-primary ps-2">{title}</h3>
            {subtitle && <div className="small text-muted ps-3 mt-1">{subtitle}</div>}
          </div>
          {right}
        </div>
        {children}
      </Card.Body>
    </Card>
  );
}

const Empty = () => <div className="text-muted small py-4 text-center">Chưa có dữ liệu trong khoảng thời gian này</div>;

function CompareCard({ label, value, prev, format = (v) => v, lowerIsBetter = false }) {
  const diff = prev ? ((value - prev) / prev) * 100 : null;
  const good = diff == null ? null : lowerIsBetter ? diff <= 0 : diff >= 0;
  return (
    <Card className="shadow-sm h-100 border-0 rounded-4">
      <Card.Body>
        <div className="small text-muted">{label}</div>
        <div className="fs-5 fw-bold">{format(value)}</div>
        <div className="small">
          {diff == null ? (
            <span className="text-muted">Kỳ trước: {format(prev)}</span>
          ) : (
            <>
              <span className={good ? 'text-success fw-medium' : 'text-danger fw-medium'}>
                {diff >= 0 ? <ArrowUpShort /> : <ArrowDownShort />}
                {Math.abs(diff).toFixed(1)}%
              </span>
              <span className="text-muted"> so với kỳ trước ({format(prev)})</span>
            </>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

function DonutChart({ data, nameKey, valueKey }) {
  if (!data.length) return <Empty />;
  const total = data.reduce((s, x) => s + x[valueKey], 0) || 1;
  return (
    <Row className="align-items-center g-2">
      <Col xs={12} md={6}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={55} outerRadius={90} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => formatVND(v)} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </Col>
      <Col xs={12} md={6}>
        <div className="d-flex flex-column gap-1 small">
          {data.map((x, i) => (
            <div key={x[nameKey]} className="d-flex align-items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span className="text-truncate flex-grow-1">{x[nameKey]}</span>
              <span className="fw-medium text-nowrap">{((x[valueKey] / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </Col>
    </Row>
  );
}

function Heatmap({ data }) {
  const map = new Map(data.map((h) => [`${h.day}-${h.hour}`, h.count]));
  const max = Math.max(1, ...data.map((h) => h.count));
  if (!data.length) return <Empty />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="small" style={{ borderCollapse: 'separate', borderSpacing: 2, minWidth: 620 }}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => <th key={h} className="text-muted fw-normal text-center" style={{ fontSize: 10 }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map(({ d, label }) => (
            <tr key={d}>
              <td className="text-muted pe-2">{label}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const c = map.get(`${d}-${h}`) || 0;
                return (
                  <td key={h} title={`${label}, ${h}h: ${c} đơn`}
                    style={{ width: 22, height: 22, borderRadius: 4, background: c ? `rgba(220,38,38,${0.15 + (c / max) * 0.85})` : 'var(--bs-tertiary-bg, #f1f5f9)' }} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small text-muted mt-2">Ô càng đậm = càng nhiều đơn. Rê chuột vào ô để xem số đơn.</div>
    </div>
  );
}

// ---------- Trang chính ----------
export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const scoped = user?.role === 'staff' && Boolean(user?.storeId);
  const [range, setRange] = useState(preset('12m'));
  const [presetKey, setPresetKey] = useState('12m');
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!scoped) storeService.getStores().then(setStores).catch(() => {});
  }, [scoped]);

  useEffect(() => {
    setLoading(true);
    setError('');
    dashboardService
      .getAnalytics({ ...range, ...(storeId ? { storeId } : {}) })
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Không tải được số liệu phân tích'))
      .finally(() => setLoading(false));
  }, [range, storeId]);

  const choosePreset = (key) => { setPresetKey(key); setRange(preset(key)); };

  const payment = useMemo(() => (data?.payment || []).map((p) => ({ ...p, name: PAYMENT_LABELS[p.mode] || p.mode })), [data]);
  const monthly = useMemo(() => (data?.monthly || []).map((m) => ({ ...m, label: monthLabel(m.month) })), [data]);
  const customers = useMemo(() => (data?.customers || []).map((m) => ({ ...m, label: monthLabel(m.month) })), [data]);
  const voucherDiscount = (data?.vouchers || []).reduce((s, v) => s + v.discount, 0);
  const voucherOrders = (data?.vouchers || []).reduce((s, v) => s + v.orders, 0);
  const maxProvince = Math.max(1, ...(data?.provinces || []).map((p) => p.revenue));

  const c = data?.compare.current;
  const p = data?.compare.previous;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Phân tích kinh doanh</h1>
          <p className="text-muted small mb-0">
            Doanh thu tính trên đơn đã giao; số đơn không tính đơn đã hủy / trả hàng.
            {scoped && ` Số liệu chi nhánh ${user.storeId?.name || 'của bạn'}.`}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div className="btn-group btn-group-sm" role="group" aria-label="Khoảng thời gian nhanh">
            {[['thisMonth', 'Tháng này'], ['lastMonth', 'Tháng trước'], ['3m', '3 tháng'], ['thisYear', 'Năm nay'], ['12m', '12 tháng']].map(([k, label]) => (
              <Button key={k} variant={presetKey === k ? 'primary' : 'outline-secondary'} onClick={() => choosePreset(k)}>{label}</Button>
            ))}
          </div>
          <Form.Control type="date" size="sm" style={{ width: 145 }} value={range.from} max={range.to} aria-label="Từ ngày"
            onChange={(e) => { setPresetKey(''); setRange((r) => ({ ...r, from: e.target.value })); }} />
          <Form.Control type="date" size="sm" style={{ width: 145 }} value={range.to} min={range.from} aria-label="Đến ngày"
            onChange={(e) => { setPresetKey(''); setRange((r) => ({ ...r, to: e.target.value })); }} />
          {!scoped && (
            <Form.Select size="sm" style={{ width: 180 }} value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Chi nhánh">
              <option value="">Tất cả chi nhánh</option>
              {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </Form.Select>
          )}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {loading && !data && <div className="text-center py-5"><Spinner animation="border" /></div>}

      {data && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
          {/* 1. So sánh cùng kỳ */}
          <Row className="g-3 mb-4">
            <Col xs={6} lg={3}><CompareCard label="Doanh thu" value={c.revenue} prev={p.revenue} format={formatVND} /></Col>
            <Col xs={6} lg={3}><CompareCard label="Số đơn" value={c.orders} prev={p.orders} /></Col>
            <Col xs={6} lg={3}><CompareCard label="Giá trị TB / đơn (AOV)" value={c.aov} prev={p.aov} format={formatVND} /></Col>
            <Col xs={6} lg={3}><CompareCard label="Tỷ lệ hủy / trả" value={c.cancelRate} prev={p.cancelRate} format={(v) => `${v}%`} lowerIsBetter /></Col>
          </Row>

          {/* 2. Doanh thu theo tháng: online vs tại quầy + AOV */}
          <Row className="g-3 mb-4">
            <Col lg={8}>
              <Section title="Doanh thu online và tại quầy (POS)" subtitle="Theo tháng">
                {monthly.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} tickLine={false} />
                      <YAxis fontSize={12} tickLine={false} tickFormatter={shortVND} />
                      <Tooltip formatter={(v) => formatVND(v)} contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="online" name="Online" stackId="a" fill="#dc2626" />
                      <Bar dataKey="pos" name="Tại quầy" stackId="a" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Section>
            </Col>
            <Col lg={4}>
              <Section title="Giá trị trung bình mỗi đơn" subtitle="AOV theo tháng">
                {monthly.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} tickLine={false} />
                      <YAxis fontSize={12} tickLine={false} tickFormatter={shortVND} width={45} />
                      <Tooltip formatter={(v) => formatVND(v)} contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="aov" name="AOV" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Section>
            </Col>
          </Row>

          {/* 3. Cơ cấu doanh thu */}
          <Row className="g-3 mb-4">
            <Col lg={6}>
              <Section title="Doanh thu theo danh mục">
                <DonutChart data={data.byCategory} nameKey="name" valueKey="revenue" />
              </Section>
            </Col>
            <Col lg={6}>
              <Section title="Doanh thu theo phương thức thanh toán">
                <DonutChart data={payment} nameKey="name" valueKey="revenue" />
              </Section>
            </Col>
          </Row>

          <Row className="g-3 mb-4">
            <Col lg={6}>
              <Section title="Top thương hiệu" subtitle="Theo doanh thu">
                {data.byBrand.length ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, data.byBrand.length * 32)}>
                    <BarChart data={data.byBrand} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" fontSize={12} tickFormatter={shortVND} />
                      <YAxis type="category" dataKey="name" fontSize={12} width={90} tickLine={false} />
                      <Tooltip formatter={(v, n, item) => [`${formatVND(v)} (${item.payload.quantity} sp)`, 'Doanh thu']} contentStyle={tooltipStyle} />
                      <Bar dataKey="revenue" fill="#7c3aed" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Section>
            </Col>
            <Col lg={6}>
              <Section title="Số lượng bán theo khoảng giá" subtitle="Khách chủ yếu mua sản phẩm tầm giá nào">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.priceBuckets}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} />
                    <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v, n, item) => [`${v} sản phẩm · ${formatVND(item.payload.revenue)}`, 'Đã bán']} contentStyle={tooltipStyle} />
                    <Bar dataKey="quantity" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            </Col>
          </Row>

          {/* 4. Thời điểm mua hàng */}
          <Row className="g-3 mb-4">
            <Col>
              <Section title="Khung giờ mua hàng" subtitle="Số đơn theo thứ trong tuần và giờ trong ngày">
                <Heatmap data={data.heatmap} />
              </Section>
            </Col>
          </Row>

          {/* 5. Con người: nhân viên, shipper */}
          <Row className="g-3 mb-4">
            <Col lg={6}>
              <Section title="Nhân viên bán hàng giỏi nhất" subtitle="Đơn bán tại quầy (POS) do nhân viên tạo">
                {data.staff.length ? (
                  <Table hover responsive size="sm" className="mb-0 align-middle">
                    <thead><tr><th>#</th><th>Nhân viên</th><th className="text-end">Đơn</th><th className="text-end">TB/đơn</th><th className="text-end">Doanh thu</th></tr></thead>
                    <tbody>
                      {data.staff.map((s, i) => (
                        <tr key={s.id}>
                          <td>{i < 3 ? <Trophy style={{ color: RANK[i] }} /> : i + 1}</td>
                          <td className="fw-medium">{s.name}</td>
                          <td className="text-end">{s.orders}</td>
                          <td className="text-end">{formatVND(s.aov)}</td>
                          <td className="text-end fw-bold text-primary">{formatVND(s.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <Empty />}
              </Section>
            </Col>
            <Col lg={6}>
              <Section title="Hiệu quả giao hàng" subtitle="Theo shipper">
                {data.shippers.length ? (
                  <Table hover responsive size="sm" className="mb-0 align-middle">
                    <thead><tr><th>Shipper</th><th className="text-end">Được giao</th><th className="text-end">Thành công</th><th className="text-end">Lần thất bại</th><th style={{ width: 120 }}>Tỷ lệ</th></tr></thead>
                    <tbody>
                      {data.shippers.map((s) => (
                        <tr key={s.id}>
                          <td className="fw-medium">{s.name}</td>
                          <td className="text-end">{s.assigned}</td>
                          <td className="text-end">{s.delivered}</td>
                          <td className="text-end">{s.failedAttempts}</td>
                          <td>
                            <div className="small text-end">{s.successRate}%</div>
                            <ProgressBar now={s.successRate} variant={s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'} style={{ height: 5 }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <Empty />}
              </Section>
            </Col>
          </Row>

          {/* 6. Khách hàng */}
          <Row className="g-3 mb-4">
            <Col lg={7}>
              <Section title="Khách hàng chi tiêu nhiều nhất" subtitle="Tính trên đơn đã giao">
                {data.topCustomers.length ? (
                  <Table hover responsive size="sm" className="mb-0 align-middle">
                    <thead><tr><th>#</th><th>Khách hàng</th><th className="text-end">Đơn</th><th className="text-end">Mua gần nhất</th><th className="text-end">Tổng chi</th></tr></thead>
                    <tbody>
                      {data.topCustomers.map((u, i) => (
                        <tr key={u.id}>
                          <td>{i < 3 ? <Trophy style={{ color: RANK[i] }} /> : i + 1}</td>
                          <td>
                            <div className="fw-medium">{u.name || '(chưa đặt tên)'}</div>
                            <div className="small text-muted">{u.email || u.phone || ''}</div>
                          </td>
                          <td className="text-end">{u.orders}</td>
                          <td className="text-end small">{new Date(u.lastOrderAt).toLocaleDateString('vi-VN')}</td>
                          <td className="text-end fw-bold text-primary">{formatVND(u.spent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <Empty />}
              </Section>
            </Col>
            <Col lg={5}>
              <Section title="Khách mới và khách quay lại" subtitle="Số khách có đơn theo tháng">
                {customers.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={customers}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} tickLine={false} />
                      <YAxis fontSize={12} tickLine={false} allowDecimals={false} width={30} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="newCustomers" name="Khách mới" stackId="c" fill="#16a34a" />
                      <Bar dataKey="returning" name="Quay lại" stackId="c" fill="#0891b2" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Section>
            </Col>
          </Row>

          <Row className="g-3 mb-4">
            <Col lg={5}>
              <Section title="Doanh thu theo tỉnh/thành" subtitle="Đơn giao tận nơi">
                {data.provinces.length ? (
                  <div className="d-flex flex-column gap-2">
                    {data.provinces.map((pr) => (
                      <div key={pr.name}>
                        <div className="d-flex justify-content-between small">
                          <span className="fw-medium">{pr.name}</span>
                          <span><span className="text-muted">{pr.orders} đơn · </span><span className="fw-bold text-primary">{formatVND(pr.revenue)}</span></span>
                        </div>
                        <ProgressBar now={(pr.revenue / maxProvince) * 100} style={{ height: 6 }} />
                      </div>
                    ))}
                  </div>
                ) : <Empty />}
              </Section>
            </Col>
            <Col lg={7}>
              <Section title="Tỷ lệ hủy và trả hàng" subtitle="Theo tháng">
                {monthly.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} tickLine={false} />
                      <YAxis yAxisId="rate" fontSize={12} tickLine={false} unit="%" width={40} />
                      <YAxis yAxisId="count" orientation="right" fontSize={12} tickLine={false} allowDecimals={false} width={30} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => (n === 'Tỷ lệ' ? `${v}%` : v)} />
                      <Legend />
                      <Line yAxisId="rate" type="monotone" dataKey="cancelRate" name="Tỷ lệ" stroke="#dc2626" strokeWidth={2.5} />
                      <Line yAxisId="count" type="monotone" dataKey="cancelled" name="Đơn hủy" stroke="#94a3b8" strokeDasharray="4 4" />
                      <Line yAxisId="count" type="monotone" dataKey="returned" name="Đơn trả" stroke="#f59e0b" strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Section>
            </Col>
          </Row>

          {/* 7a. Chương trình khuyến mãi tự động (chiến dịch marketing) */}
          <Row className="g-3 mb-4">
            <Col>
              <Section title="Hiệu quả chiến dịch khuyến mãi" subtitle="Chương trình giảm giá tự động - đơn đã giao trong kỳ">
                {data.campaigns?.length ? (
                  <Table hover responsive size="sm" className="mb-0 align-middle">
                    <thead><tr><th>Chương trình</th><th>Kênh</th><th className="text-end">Đơn</th><th className="text-end">Đã giảm</th><th className="text-end">Doanh thu</th><th className="text-end">Doanh thu / 1đ giảm</th></tr></thead>
                    <tbody>
                      {data.campaigns.map((cp) => (
                        <tr key={cp.id}>
                          <td className="fw-medium">{cp.name}</td>
                          <td className="small text-muted">{cp.campaign || '—'}</td>
                          <td className="text-end">{cp.orders}</td>
                          <td className="text-end text-danger">{formatVND(cp.discount)}</td>
                          <td className="text-end fw-bold text-primary">{formatVND(cp.revenue)}</td>
                          <td className="text-end">{cp.discount ? `${(cp.revenue / cp.discount).toFixed(1)}đ` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <Empty />}
              </Section>
            </Col>
          </Row>

          {/* 7. Voucher và hàng bán chậm */}
          <Row className="g-3">
            <Col lg={5}>
              <Section title="Hiệu quả mã giảm giá"
                right={<div className="small text-end"><div><span className="text-muted">Đơn dùng mã </span><b>{voucherOrders}</b></div><div><span className="text-muted">Tổng đã giảm </span><b className="text-danger">{formatVND(voucherDiscount)}</b></div></div>}>
                {data.vouchers.length ? (
                  <Table hover responsive size="sm" className="mb-0">
                    <thead><tr><th>Mã</th><th className="text-end">Đơn</th><th className="text-end">Đã giảm</th><th className="text-end">Doanh thu</th></tr></thead>
                    <tbody>
                      {data.vouchers.map((v) => (
                        <tr key={v.code}>
                          <td><code>{v.code}</code></td>
                          <td className="text-end">{v.orders}</td>
                          <td className="text-end text-danger">{formatVND(v.discount)}</td>
                          <td className="text-end">{formatVND(v.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <Empty />}
              </Section>
            </Col>
            <Col lg={7}>
              <Section title="Sản phẩm bán chậm" subtitle="Còn tồn kho nhưng bán ít nhất trong kỳ - cân nhắc khuyến mãi / xả kho">
                {data.slowMovers.length ? (
                  <Table hover responsive size="sm" className="mb-0 align-middle">
                    <thead><tr><th>Sản phẩm</th><th className="text-end">Giá</th><th className="text-end">Tồn kho</th><th className="text-end">Đã bán</th></tr></thead>
                    <tbody>
                      {data.slowMovers.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <img src={s.image || placeholderImage(40, 40)} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6 }} />
                              <span className="small text-truncate" style={{ maxWidth: 260 }}>{s.title}</span>
                            </div>
                          </td>
                          <td className="text-end small">{formatVND(s.price)}</td>
                          <td className="text-end fw-medium">{s.stock}</td>
                          <td className={`text-end fw-bold ${s.sold === 0 ? 'text-danger' : ''}`}>{s.sold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <Empty />}
              </Section>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
}
