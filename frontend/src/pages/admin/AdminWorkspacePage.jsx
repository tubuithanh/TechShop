import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart } from 'recharts';
import { Badge, Card, Col, Row, Spinner, Alert, Button, Form, InputGroup, Table, Dropdown } from 'react-bootstrap';
import {
  CheckCircleFill, ChatDots, BoxSeam, Truck, Tools, Cash, LightningChargeFill, ExclamationTriangleFill, Shop, ArrowRepeat, ArrowLeftRight, Star,
  FileEarmarkText, HeartPulse, GraphUpArrow, ClockHistory, TelephoneFill, GeoAltFill, BagCheck, Receipt, Search, People, Activity, Map,
  ChevronDown, ChevronUp, Sliders, Cart3, ShieldCheck, Bicycle, PersonBadge, Boxes
} from 'react-bootstrap-icons';
import api from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { hasPagePermission } from '../../utils/permissions';
import { orderDateTime, timeAgo } from '../../utils/orderTime';
import AdminThumb from '../../components/admin/AdminThumb';

const vnd = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const short = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} tr` : vnd(v));
const mins = (m) => (m < 60 ? `${m} phút` : m < 1440 ? `${Math.floor(m / 60)} giờ` : `${Math.floor(m / 1440)} ngày`);
const W_STATUS = { received: 'Mới tiếp nhận', checking: 'Đang kiểm tra', repairing: 'Đang sửa', waiting_parts: 'Chờ linh kiện' };
const ST_LABEL = { pending: 'Đặt hàng', confirmed: 'Xác nhận', processing: 'Chuẩn bị', ready_for_pickup: 'Sẵn sàng nhận', shipping: 'Đang giao', delivered: 'Hoàn tất', cancelled: 'Hủy', returning: 'Trả hàng', returned: 'Đã nhận trả' };
const HIDE_KEY = 'dashboard.hidden';
const readHidden = () => { try { return JSON.parse(localStorage.getItem(HIDE_KEY) || '[]'); } catch { return []; } };

// Ô "việc cần làm": số lớn + mô tả + đi tới màn hình xử lý
function Task({ to, icon: Icon, count, label, sub, tone = 'primary', allowed = true }) {
  const body = (
    <Card className={`h-100 ws-task border-start border-4 border-${count ? tone : 'success'}`}>
      <Card.Body className="d-flex align-items-center gap-3 py-3">
        <Icon size={26} className={`text-${count ? tone : 'success'}`} />
        <div className="flex-grow-1 min-w-0">
          <div className="fs-3 fw-bold lh-1">{count}</div>
          <div className="fw-medium">{label}</div>
          {sub && <div className="small text-muted text-truncate">{sub}</div>}
        </div>
        {allowed && to && <span className="small text-primary text-nowrap">Xử lý →</span>}
      </Card.Body>
    </Card>
  );
  return allowed && to ? <Link to={to} className="text-decoration-none text-body">{body}</Link> : body;
}
const Stat = ({ label, value, sub, tone }) => (
  <div className="ws-stat"><div className="small text-muted">{label}</div><div className={`fs-5 fw-bold ${tone ? `text-${tone}` : ''}`}>{value}</div>{sub && <div className="small text-muted">{sub}</div>}</div>
);
// Khối thu gọn / ẩn được (máy nhớ lựa chọn)
function Section({ id, title, icon: Icon, children, action, hidden, onToggle }) {
  if (hidden.includes(`off:${id}`)) return null;
  const collapsed = hidden.includes(id);
  return (
    <Card className="shadow-sm mb-3">
      <Card.Body className={collapsed ? 'py-2' : ''}>
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-link p-0 text-body text-decoration-none fw-semibold fs-6" onClick={() => onToggle(id)} aria-expanded={!collapsed}>
            <Icon className="me-2" />{title} {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          {action && !collapsed && <span className="ms-auto">{action}</span>}
        </div>
        {!collapsed && <div className="mt-2">{children}</div>}
      </Card.Body>
    </Card>
  );
}
const OrderList = ({ list, empty, extra }) => (list?.length ? (
  <div className="d-flex flex-column gap-1">
    {list.map((o) => (
      <Link key={o._id} to={`/admin/orders?view=all&q=${o.orderCode}`} className="ws-row text-decoration-none text-body">
        <span className="fw-medium">#{o.orderCode}</span>
        {o.express && <Badge bg="danger" className="fw-normal"><LightningChargeFill size={10} /> Hỏa tốc</Badge>}
        <span className="text-muted small text-truncate flex-grow-1">{o.name} · {o.phone}</span>
        {extra ? extra(o) : <span className="small text-muted text-nowrap">{orderDateTime(o.createdAt)} ({timeAgo(o.createdAt)})</span>}
        <span className="fw-semibold text-nowrap">{short(o.grandTotal)}</span>
      </Link>
    ))}
  </div>
) : <div className="small text-success"><CheckCircleFill className="me-1" />{empty}</div>);

// Nút thao tác nhanh theo vị trí
const ACTIONS = {
  sales: [['/admin/pos', 'Bán tại quầy', Cart3, 'primary'], ['/admin/orders', 'Xử lý đơn', ClockHistory], ['/admin/chat', 'Chat khách', ChatDots], ['/admin/warranties', 'Tiếp nhận bảo hành', ShieldCheck], ['/admin/my-report', 'Báo cáo của tôi', PersonBadge]],
  warehouse: [['/admin/orders?view=all&status=confirmed', 'Đơn cần chuẩn bị', BoxSeam, 'primary'], ['/admin/inventory', 'Tồn kho', Boxes], ['/admin/orders?view=all&status=returning', 'Nhận hàng trả', ArrowLeftRight], ['/admin/my-report', 'Báo cáo của tôi', PersonBadge]],
  delivery: [['/admin/my-deliveries', 'Đơn tôi cần giao', Bicycle, 'primary'], ['/admin/my-report', 'Báo cáo của tôi', PersonBadge]],
  warranty: [['/admin/warranties', 'Phiếu bảo hành', Tools, 'primary'], ['/admin/warranty-cards', 'Tra sổ bảo hành', ShieldCheck], ['/admin/my-report', 'Báo cáo của tôi', PersonBadge]],
  manager: [['/admin/orders', 'Xử lý đơn', ClockHistory, 'primary'], ['/admin/deliveries', 'Phân công giao', Truck], ['/admin/pos', 'Bán tại quầy', Cart3], ['/admin/express', 'Mở hỏa tốc', LightningChargeFill], ['/admin/einvoices', 'Hóa đơn', FileEarmarkText], ['/admin/staff-reports', 'Báo cáo nhân viên', People], ['/admin/store-health', 'Sức khỏe chi nhánh', HeartPulse]],
  admin: [['/admin/orders', 'Xử lý đơn', ClockHistory, 'primary'], ['/admin/deliveries', 'Phân công giao', Truck], ['/admin/einvoices', 'Hóa đơn', FileEarmarkText], ['/admin/products', 'Sản phẩm', BoxSeam], ['/admin/staff-reports', 'Báo cáo nhân viên', People], ['/admin/store-health', 'Sức khỏe chi nhánh', HeartPulse], ['/admin', 'Thống kê', GraphUpArrow]]
};
const SECTIONS = [['charts', 'Biểu đồ hôm nay'], ['confirm', 'Đơn chờ xác nhận'], ['prepare', 'Đơn cần chuẩn bị'], ['stock', 'Hàng sắp hết'], ['pickup', 'Khách nhận tại quầy'], ['team', 'Đội ngũ hôm nay'], ['stores', 'Các chi nhánh hôm nay'], ['feed', 'Hoạt động gần nhất'], ['route', 'Lộ trình giao'], ['shipping', 'Đơn đang giao'], ['tickets', 'Phiếu bảo hành']];
// Trang không khai báo quyền riêng (backend tự giới hạn theo vai trò)
const OPEN_PAGES = ['/admin/my-report', '/admin/store-health', '/admin/staff-reports'];

// DASHBOARD theo vị trí (bán hàng, kho, giao hàng, kỹ thuật, trưởng cửa hàng, admin)
export default function AdminWorkspacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [hidden, setHidden] = useState(readHidden);
  const can = (path) => OPEN_PAGES.includes(path) || hasPagePermission(user, path.split('?')[0]);
  const load = useCallback(() => { setLoading(true); return api.get('/workspace').then((r) => { setD(r.data.data); setError(''); }).catch((e) => setError(e.response?.data?.message || 'Không tải được')).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  const saveHidden = (next) => { setHidden(next); try { localStorage.setItem(HIDE_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ } };
  const toggle = (id) => saveHidden(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  const toggleOff = (id) => saveHidden(hidden.includes(`off:${id}`) ? hidden.filter((x) => x !== `off:${id}`) : [...hidden, `off:${id}`]);
  const sec = { hidden, onToggle: toggle };

  if (error && !d) return <Alert variant="danger">{error}</Alert>;
  if (!d) return <div className="p-4"><Spinner /></div>;
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const s = d.sales; const w = d.warehouse; const dl = d.delivery; const wr = d.warranty; const m = d.manager;
  const search = (e) => { e.preventDefault(); const v = q.trim(); if (v) navigate(`/admin/orders?view=all&q=${encodeURIComponent(v.replace(/^#/, ''))}`); };

  return (
    <div className="container-fluid">
      {/* Đầu trang */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold mb-0">{greet}, {d.name}!</h1>
          <div className="text-muted small">{d.roleLabel}{d.store && <> · <Shop className="me-1" />{d.store}</>} · {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>
        <div className="ms-auto d-flex gap-2 align-items-center">
          <span className="small text-muted d-none d-md-inline">Cập nhật {new Date(d.generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
          <Dropdown align="end" autoClose="outside">
            <Dropdown.Toggle size="sm" variant="outline-secondary"><Sliders className="me-1" />Tùy chỉnh</Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Header>Hiện / ẩn khối</Dropdown.Header>
              {SECTIONS.map(([id, label]) => <Dropdown.ItemText key={id}><Form.Check id={`sec-${id}`} label={label} checked={!hidden.includes(`off:${id}`)} onChange={() => toggleOff(id)} /></Dropdown.ItemText>)}
              <Dropdown.Divider /><Dropdown.Item onClick={() => saveHidden([])}>Khôi phục mặc định</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
          <Button size="sm" variant="outline-secondary" onClick={load} disabled={loading}><ArrowRepeat className={`me-1 ${loading ? 'spin' : ''}`} />Làm mới</Button>
        </div>
      </div>

      {/* Thao tác nhanh + tìm đơn */}
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        {(ACTIONS[d.role] || []).filter(([to]) => can(to)).map(([to, label, Icon, variant]) => (
          <Button key={to} as={Link} to={to} variant={variant || 'outline-primary'} className="ws-action"><Icon className="me-2" />{label}</Button>
        ))}
        {can('/admin/orders') && (
          <Form onSubmit={search} className="ms-lg-auto" style={{ minWidth: 260 }}>
            <InputGroup>
              <InputGroup.Text><Search /></InputGroup.Text>
              <Form.Control placeholder="Tìm đơn: mã / SĐT / tên khách" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm đơn hàng" />
            </InputGroup>
          </Form>
        )}
      </div>

      {/* ===== TRƯỞNG CỬA HÀNG / ADMIN ===== */}
      {m && (
        <Row xs={1} sm={2} xl={4} className="g-3 mb-3">
          <Col><Task to="/admin/orders" allowed={can('/admin/orders')} icon={ClockHistory} count={d.toConfirm?.count || 0} label="Đơn chờ xác nhận" sub={d.toConfirm?.count ? `chờ lâu nhất ${mins(d.toConfirm.oldestMinutes)}` : 'đã xử lý hết'} tone="warning" /></Col>
          <Col><Task to="/admin/deliveries" allowed={can('/admin/deliveries')} icon={Truck} count={m.unassignedDeliveries} label="Đơn chưa phân công giao" tone="danger" /></Col>
          <Col><Task to="/admin/orders?view=all&refundStatus=pending" allowed={can('/admin/orders')} icon={Cash} count={m.refundsPending} label="Đơn chờ hoàn tiền" tone="danger" /></Col>
          <Col><Task to="/admin/reviews?view=list&rating=1" allowed={can('/admin/reviews')} icon={Star} count={m.badReviews} label="Đánh giá xấu chưa trả lời" sub="1-2★ trong 7 ngày" tone="danger" /></Col>
          <Col><Task to="/admin/deliveries" allowed={can('/admin/deliveries')} icon={ExclamationTriangleFill} count={m.stuckShipping} label="Đơn giao quá 3 ngày" sub="cần liên hệ shipper / khách" tone="warning" /></Col>
          <Col><Task to="/admin/einvoices" allowed={can('/admin/einvoices')} icon={FileEarmarkText} count={m.einvoicePending} label="Đơn chưa xuất hóa đơn" tone="info" /></Col>
          <Col><Task to="/admin/orders?view=all&status=returning" allowed={can('/admin/orders')} icon={ArrowLeftRight} count={w?.returnsToReceive || 0} label="Hàng trả chờ nhận" tone="warning" /></Col>
          <Col><Task to="/admin/chat" allowed={can('/admin/chat')} icon={ChatDots} count={d.chatsWaiting || 0} label="Khách đang chờ chat" tone="danger" /></Col>
        </Row>
      )}
      {m && (
        <div className="ws-stats mb-3">
          <Stat label="Doanh thu hoàn tất hôm nay" value={vnd(m.revenueToday)} sub={`hôm qua ${short(m.revenueYesterday)}`} tone={m.revenueToday >= m.revenueYesterday ? 'success' : 'warning'} />
          <Stat label="Đơn hoàn tất hôm nay" value={m.ordersDoneToday} />
          <Stat label="Chuyển khoản chưa nhận" value={d.transferUnpaid ?? 0} tone={d.transferUnpaid ? 'warning' : ''} />
          <Stat label="Khung hỏa tốc đang mở" value={m.expressOpen} />
          {wr && <Stat label="Bảo hành đang xử lý" value={wr.open} sub={wr.overdue ? `${wr.overdue} phiếu quá 7 ngày` : 'không có phiếu trễ'} tone={wr.overdue ? 'danger' : ''} />}
        </div>
      )}

      {/* ===== BÁN HÀNG ===== */}
      {d.role === 'sales' && s && (
        <Row xs={1} sm={2} xl={4} className="g-3 mb-3">
          <Col><Task to="/admin/orders" allowed={can('/admin/orders')} icon={ClockHistory} count={d.toConfirm.count} label="Đơn online chờ xác nhận" sub={d.toConfirm.count ? `chờ lâu nhất ${mins(d.toConfirm.oldestMinutes)}` : 'đã xử lý hết'} tone="warning" /></Col>
          <Col><Task to="/admin/chat" allowed={can('/admin/chat')} icon={ChatDots} count={d.chatsWaiting} label="Khách đang chờ chat" tone="danger" /></Col>
          <Col><Task to="/admin/orders?view=all&paymentMode=bank_transfer" allowed={can('/admin/orders')} icon={Cash} count={d.transferUnpaid} label="Chuyển khoản cần kiểm tra" tone="info" /></Col>
          <Col><Task to="/admin/pos" allowed={can('/admin/pos')} icon={BagCheck} count={s.todayOrders} label="Đơn tại quầy hôm nay" sub={vnd(s.todayRevenue)} tone="success" /></Col>
        </Row>
      )}
      {s && (d.role === 'sales' || d.role === 'manager') && (
        <div className="ws-stats mb-3">
          <Stat label="Doanh số của tôi hôm nay" value={vnd(s.todayRevenue)} sub={`${s.todayOrders} đơn tại quầy`} />
          <Stat label="Tháng này" value={vnd(s.monthRevenue)} sub={`${s.monthOrders} đơn`} />
          <Stat label="So với tháng trước" value={s.lastMonthRevenue ? `${s.monthRevenue >= s.lastMonthRevenue ? '▲' : '▼'} ${Math.round(Math.abs(s.monthRevenue - s.lastMonthRevenue) / s.lastMonthRevenue * 100)}%` : '—'} sub={`tháng trước ${short(s.lastMonthRevenue)}`} tone={s.monthRevenue >= s.lastMonthRevenue ? 'success' : 'warning'} />
        </div>
      )}

      {/* ===== KHO ===== */}
      {w && d.role === 'warehouse' && (
        <Row xs={1} sm={2} xl={4} className="g-3 mb-3">
          <Col><Task to="/admin/orders?view=all&status=confirmed" allowed={can('/admin/orders')} icon={BoxSeam} count={w.toPrepare.count} label="Đơn cần chuẩn bị hàng" tone="warning" /></Col>
          <Col><Task to="/admin/orders?view=all&status=ready_for_pickup" allowed={can('/admin/orders')} icon={Shop} count={w.pickupWaiting.length} label="Khách hẹn nhận tại quầy" tone="info" /></Col>
          <Col><Task to="/admin/orders?view=all&status=returning" allowed={can('/admin/orders')} icon={ArrowLeftRight} count={w.returnsToReceive} label="Hàng trả chờ nhận" tone="warning" /></Col>
          <Col><Task to="/admin/inventory" allowed={can('/admin/inventory')} icon={ExclamationTriangleFill} count={w.stockAlerts.length} label="Hàng bán chạy sắp hết" tone="danger" /></Col>
        </Row>
      )}

      {/* ===== GIAO HÀNG ===== */}
      {dl && (
        <>
          <Row xs={1} sm={2} xl={4} className="g-3 mb-3">
            <Col><Task to="/admin/my-deliveries" icon={BoxSeam} count={dl.toPickup.length} label="Đơn cần lấy hàng" tone="warning" /></Col>
            <Col><Task to="/admin/my-deliveries" icon={Truck} count={dl.shipping.length} label="Đang giao" tone="primary" /></Col>
            <Col><Task to="/admin/my-deliveries" icon={LightningChargeFill} count={dl.express.length} label="Đơn hỏa tốc" sub={dl.express[0] ? (dl.express[0].minutesLeft < 0 ? `TRỄ ${-dl.express[0].minutesLeft} phút!` : `gấp nhất còn ${mins(dl.express[0].minutesLeft)}`) : 'không có'} tone="danger" /></Col>
            <Col><Task to="/admin/my-deliveries" icon={Cash} count={dl.codCount} label="Khoản COD đang giữ" sub={vnd(dl.codHeld)} tone="secondary" /></Col>
          </Row>
          <div className="ws-stats mb-3">
            <Stat label="Giao thành công hôm nay" value={dl.deliveredToday} tone="success" />
            <Stat label="Giao thất bại hôm nay" value={dl.failedToday} tone={dl.failedToday ? 'danger' : ''} />
            <Stat label="Tỷ lệ thành công hôm nay" value={dl.deliveredToday + dl.failedToday ? `${Math.round(dl.deliveredToday / (dl.deliveredToday + dl.failedToday) * 100)}%` : '—'} />
            <Stat label="Điểm khách chấm (30 ngày)" value={dl.rating != null ? `${dl.rating}★` : '—'} sub={`${dl.ratingCount} đánh giá`} />
          </div>
          <Section id="route" title="Lộ trình theo khu vực" icon={Map} {...sec} action={dl.mapsUrl && <a href={dl.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-success"><Map className="me-1" />Mở Google Maps ({dl.shipping.length} điểm)</a>}>
            {dl.route.length ? dl.route.map((g) => (
              <div key={g.area} className="mb-2">
                <div className="fw-medium"><GeoAltFill className="text-danger me-1" />{g.area} <Badge bg="light" text="dark" className="border">{g.stops.length} đơn</Badge></div>
                {g.stops.map((x) => <div key={x.orderCode} className="small ms-4 text-muted">#{x.orderCode} · {x.address} {x.express && <Badge bg="danger" className="fw-normal">Hỏa tốc</Badge>} <span className="text-body">{x.status === 'shipping' ? '· đang giao' : '· chờ lấy hàng'}</span></div>)}
              </div>
            )) : <div className="small text-success"><CheckCircleFill className="me-1" />Không có đơn đang giữ</div>}
          </Section>
          {dl.shipping.length > 0 && (
            <Section id="shipping" title="Đơn đang giao" icon={Truck} {...sec} action={<Link to="/admin/my-deliveries" className="small">Cập nhật kết quả →</Link>}>
              {dl.shipping.map((o) => (
                <div key={o._id} className="ws-row">
                  <span className="fw-medium">#{o.orderCode}</span>
                  {o.express && <Badge bg="danger" className="fw-normal">Hỏa tốc</Badge>}
                  <span className="small flex-grow-1 text-truncate"><GeoAltFill className="text-danger me-1" />{o.address}</span>
                  <a href={`tel:${o.phone}`} className="small text-nowrap"><TelephoneFill className="me-1" />{o.phone}</a>
                  <span className="fw-semibold text-nowrap">{o.paymentMode === 'cod' ? `Thu ${short(o.grandTotal)}` : 'Đã TT'}</span>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {/* ===== KỸ THUẬT BẢO HÀNH ===== */}
      {wr && d.role === 'warranty' && (
        <>
          <Row xs={1} sm={2} xl={4} className="g-3 mb-3">
            <Col><Task to="/admin/warranties" allowed={can('/admin/warranties')} icon={Tools} count={wr.open} label="Phiếu đang xử lý" tone="primary" /></Col>
            <Col><Task to="/admin/warranties" allowed={can('/admin/warranties')} icon={ExclamationTriangleFill} count={wr.overdue} label="Phiếu quá 7 ngày" tone="danger" /></Col>
            <Col><Task to="/admin/warranties" allowed={can('/admin/warranties')} icon={ClockHistory} count={wr.byStatus.waiting_parts || 0} label="Chờ linh kiện" tone="warning" /></Col>
            <Col><Task to="/admin/warranties" allowed={can('/admin/warranties')} icon={CheckCircleFill} count={wr.doneMonth} label="Hoàn tất tháng này" sub={wr.rating != null ? `khách chấm ${wr.rating}★ (${wr.ratedCount})` : ''} tone="success" /></Col>
          </Row>
          <Row className="g-3">
            <Col lg={4}>
              <Section id="tickets-chart" title="Phiếu theo trạng thái" icon={Activity} {...sec}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={Object.entries(W_STATUS).map(([k, label]) => ({ label, n: wr.byStatus[k] || 0 }))} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" allowDecimals={false} fontSize={11} /><YAxis type="category" dataKey="label" width={100} fontSize={11} /><Tooltip />
                    <Bar dataKey="n" name="Số phiếu" fill="#6f42c1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            </Col>
            <Col lg={8}>
              <Section id="tickets" title="Phiếu chờ lâu nhất" icon={Tools} {...sec} action={can('/admin/warranties') && <Link to="/admin/warranties" className="small">Tất cả phiếu →</Link>}>
                {wr.oldest.length ? wr.oldest.map((t) => (
                  <div key={t._id} className="ws-row">
                    <span className="fw-medium">{t.ticketCode}</span>
                    <Badge bg={t.days > 7 ? 'danger' : 'secondary'} className="fw-normal">{W_STATUS[t.status] || t.status}</Badge>
                    <span className="small flex-grow-1 text-truncate">{t.product} · {t.issue}</span>
                    {t.phone && <a href={`tel:${t.phone}`} className="small text-nowrap">{t.customer} · {t.phone}</a>}
                    <span className={`small text-nowrap ${t.days > 7 ? 'text-danger fw-semibold' : 'text-muted'}`}>{t.days} ngày</span>
                  </div>
                )) : <div className="small text-success"><CheckCircleFill className="me-1" />Không có phiếu tồn</div>}
              </Section>
            </Col>
          </Row>
        </>
      )}

      {/* ===== BIỂU ĐỒ HÔM NAY ===== */}
      {d.hourly && (
        <Section id="charts" title="Biểu đồ hôm nay" icon={GraphUpArrow} {...sec} action={can('/admin') && <Link to="/admin" className="small">Thống kê đầy đủ →</Link>}>
          <Row className="g-3">
            <Col lg={7}>
              <div className="small fw-medium mb-1">Đơn đặt theo giờ: hôm nay so với hôm qua</div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={d.hourly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip labelFormatter={(h) => `${h}:00 - ${h}:59`} />
                  <Legend />
                  <Bar dataKey="today" name="Hôm nay" fill="#0d6efd" radius={[3, 3, 0, 0]} />
                  <Line dataKey="yesterday" name="Hôm qua" stroke="#adb5bd" strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Col>
            <Col lg={5}>
              <div className="small fw-medium mb-1">Doanh thu hoàn tất 7 ngày</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.week}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(x) => `${x.slice(8, 10)}/${x.slice(5, 7)}`} fontSize={11} />
                  <YAxis tickFormatter={short} fontSize={11} width={50} />
                  <Tooltip formatter={(v, n) => (n === 'Doanh thu' ? vnd(v) : v)} labelFormatter={(x) => new Date(x).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#198754" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Col>
          </Row>
        </Section>
      )}

      <Row className="g-3">
        <Col xl={d.feed ? 8 : 12}>
          {d.toConfirm?.list?.length > 0 && (d.role === 'sales' || d.role === 'manager' || d.role === 'admin') && (
            <Section id="confirm" title={`Đơn chờ xác nhận lâu nhất (${d.toConfirm.count})`} icon={ClockHistory} {...sec} action={can('/admin/orders') && <Link to="/admin/orders" className="small">Xử lý tất cả →</Link>}>
              <OrderList list={d.toConfirm.list} empty="Không có đơn chờ" />
            </Section>
          )}
          {w && (d.role === 'warehouse' || d.role === 'manager') && (
            <Section id="prepare" title={`Đơn cần chuẩn bị (${w.toPrepare.count})`} icon={BoxSeam} {...sec} action={can('/admin/orders') && <Link to="/admin/orders?view=all&status=confirmed" className="small">Xem tất cả →</Link>}>
              <OrderList list={w.toPrepare.list} empty="Không có đơn cần chuẩn bị" extra={(o) => <span className="small text-muted text-nowrap">{o.method === 'store_pickup' ? 'Nhận tại quầy' : 'Giao tận nơi'} · {timeAgo(o.createdAt)}</span>} />
            </Section>
          )}
          {w && (
            <Section id="stock" title="Hàng bán chạy sắp hết" icon={ExclamationTriangleFill} {...sec} action={can('/admin/inventory') && <Link to="/admin/inventory" className="small">Tồn kho →</Link>}>
              {w.stockAlerts.length ? (
                <div className="d-flex flex-column gap-1">
                  {w.stockAlerts.map((x, i) => (
                    <div key={i} className="ws-row">
                      <span className="text-truncate flex-grow-1">{x.name} <span className="text-muted small">{x.label}</span></span>
                      <span className="small text-muted text-nowrap">bán {x.sold}/30 ngày</span>
                      <Badge bg={x.stock === 0 ? 'danger' : 'warning'} text={x.stock === 0 ? undefined : 'dark'}>{x.stock === 0 ? 'Hết hàng' : `Còn ${x.stock}`}</Badge>
                    </div>
                  ))}
                </div>
              ) : <div className="small text-success"><CheckCircleFill className="me-1" />Hàng bán chạy đều đủ</div>}
            </Section>
          )}
          {w?.pickupWaiting?.length > 0 && (
            <Section id="pickup" title="Khách sẽ đến nhận hàng tại quầy" icon={Shop} {...sec}>
              <OrderList list={w.pickupWaiting} empty="" extra={(o) => <span className="small text-muted text-nowrap">sẵn sàng {mins(o.waitingMinutes)} trước</span>} />
            </Section>
          )}
          {d.team && (
            <Section id="team" title={`Đội ngũ hôm nay (${d.team.filter((x) => x.activeToday).length}/${d.team.length} đang làm việc)`} icon={People} {...sec} action={<Link to="/admin/staff-reports" className="small">Báo cáo nhân viên →</Link>}>
              <div className="table-responsive">
                <Table size="sm" hover className="mb-0 align-middle small">
                  <thead><tr className="text-muted"><th>Nhân viên</th><th className="text-end">Bán quầy</th><th className="text-end">Xử lý đơn</th><th className="text-end">Giao (✓/✗)</th><th className="text-end">Bảo hành</th><th className="text-end">Đăng nhập</th></tr></thead>
                  <tbody>
                    {d.team.slice(0, 15).map((x) => (
                      <tr key={x._id} className={x.activeToday ? '' : 'text-muted'}>
                        <td><div className="d-flex align-items-center gap-2"><AdminThumb src={x.avatar} name={x.name} size={26} rounded /><div className="min-w-0"><Link to={`/admin/staff-reports/${x._id}`} className="text-body fw-medium">{x.name}</Link><div className="text-muted" style={{ fontSize: '0.72rem' }}>{x.title}{x.store && ` · ${x.store}`}</div></div>{x.activeToday && <span className="ws-dot" title="Đang làm việc hôm nay" />}</div></td>
                        <td className="text-end">{x.posOrders ? <>{x.posOrders} · {short(x.posRevenue)}</> : '—'}</td>
                        <td className="text-end">{x.statusUpdates || '—'}</td>
                        <td className="text-end">{x.delivered || x.failed ? <><span className="text-success">{x.delivered}</span>/<span className={x.failed ? 'text-danger' : ''}>{x.failed}</span></> : '—'}</td>
                        <td className="text-end">{x.warrantyUpdates || '—'}</td>
                        <td className="text-end text-nowrap">{x.lastLoginAt ? timeAgo(x.lastLoginAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Section>
          )}
          {d.stores && (
            <Section id="stores" title="Các chi nhánh hôm nay" icon={Shop} {...sec} action={<Link to="/admin/store-health" className="small"><HeartPulse className="me-1" />Sức khỏe chi nhánh →</Link>}>
              <Table size="sm" hover className="mb-0 small align-middle">
                <thead><tr className="text-muted"><th>Chi nhánh</th><th className="text-end">Doanh thu hoàn tất</th><th className="text-end">Đơn xong</th><th className="text-end">Chờ xác nhận</th><th className="text-end">Chưa phân công giao</th></tr></thead>
                <tbody>
                  {d.stores.map((x) => (
                    <tr key={x._id}>
                      <td className="fw-medium">{x.name}</td>
                      <td className="text-end fw-semibold">{vnd(x.revenue)}</td>
                      <td className="text-end">{x.done}</td>
                      <td className={`text-end ${x.pending ? 'text-warning fw-semibold' : ''}`}>{x.pending}</td>
                      <td className={`text-end ${x.unassigned ? 'text-danger fw-semibold' : ''}`}>{x.unassigned}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          )}
        </Col>
        {d.feed && (
          <Col xl={4}>
            <Section id="feed" title="Hoạt động gần nhất" icon={Activity} {...sec}>
              {d.feed.length ? (
                <ul className="ws-feed">
                  {d.feed.map((f, i) => (
                    <li key={i}>
                      <Link to={`/admin/orders?view=all&q=${f.orderCode}`} className="fw-medium">#{f.orderCode}</Link>{' '}
                      <Badge bg="light" text="dark" className="border fw-normal">{ST_LABEL[f.status] || f.status}</Badge>
                      <div className="small text-muted text-truncate">{f.note}</div>
                      <div className="small text-muted">{f.by || 'Hệ thống'} · {timeAgo(f.at)}</div>
                    </li>
                  ))}
                </ul>
              ) : <div className="small text-muted">Chưa có hoạt động trong 2 ngày</div>}
            </Section>
          </Col>
        )}
      </Row>
      <div className="small text-muted mt-2"><Receipt className="me-1" />Tự cập nhật mỗi phút · nội dung theo vị trí "{d.roleLabel}" (đổi chức danh trong Admin → Nhân viên) · bấm tiêu đề khối để thu gọn, "Tùy chỉnh" để ẩn / hiện khối.</div>
    </div>
  );
}
