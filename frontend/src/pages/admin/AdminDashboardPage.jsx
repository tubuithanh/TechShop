import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Row, Col, Table, ProgressBar, Badge } from 'react-bootstrap';
import { CashStack, ReceiptCutoff, People, BoxSeam, ShopWindow } from 'react-bootstrap-icons';
import { dashboardService } from '../../services/dashboardService';
import { placeholderImage } from '../../utils/placeholderImage';
import AnimatedCounter from '../../components/AnimatedCounter';

function formatVND(value) {
  return (value || 0).toLocaleString('vi-VN') + 'đ';
}

const STATUS_LABEL = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả'
};
const STATUS_VARIANT = {
  pending: 'secondary',
  confirmed: 'info',
  processing: 'primary',
  shipping: 'warning',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'dark'
};
const RANK_BADGE = ['#f59e0b', '#94a3b8', '#b45309']; // vàng / bạc / đồng cho top 1-2-3

function SectionTitle({ children }) {
  return <h3 className="fw-bold fs-6 mb-3 border-start border-4 border-primary ps-2">{children}</h3>;
}

const STAT_CARDS = [
  { key: 'totalRevenue', label: 'Tổng doanh thu (đã giao)', icon: CashStack, bg: 'primary-subtle', text: 'primary-emphasis' },
  { key: 'totalOrders', label: 'Tổng đơn hàng', icon: ReceiptCutoff, bg: 'info-subtle', text: 'info-emphasis' },
  { key: 'totalCustomers', label: 'Khách hàng', icon: People, bg: 'success-subtle', text: 'success-emphasis' },
  { key: 'totalProducts', label: 'Sản phẩm đang bán', icon: BoxSeam, bg: 'warning-subtle', text: 'warning-emphasis' }
];

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [bestSelling, setBestSelling] = useState([]);
  const [revenueByStore, setRevenueByStore] = useState([]);
  const [orderStatusStats, setOrderStatusStats] = useState([]);

  useEffect(() => {
    dashboardService.getSummary().then(setSummary);
    dashboardService.getRevenueByDay(7).then(setRevenueData);
    dashboardService.getBestSelling(5).then(setBestSelling);
    dashboardService.getRevenueByStore().then(setRevenueByStore);
    dashboardService.getOrderStatusStats().then(setOrderStatusStats);
  }, []);

  const maxStoreRevenue = Math.max(1, ...revenueByStore.map((s) => s.revenue));
  const maxSold = Math.max(1, ...bestSelling.map((p) => p.soldCount));
  const totalOrdersForStatus = orderStatusStats.reduce((sum, s) => sum + s.count, 0) || 1;
  const avgRevenuePerDay = revenueData.length
    ? revenueData.reduce((sum, d) => sum + d.revenue, 0) / revenueData.length
    : 0;

  return (
    <div>
      <div className="mb-4 fade-in-up">
        <h1 className="fs-4 fw-bold mb-1">Tổng quan hệ thống</h1>
        <p className="text-muted small mb-0">Số liệu kinh doanh cập nhật theo thời gian thực từ toàn bộ chi nhánh</p>
      </div>

      <Row className="g-3 mb-4">
        {STAT_CARDS.map((c, idx) => (
          <Col key={c.key} xs={6} md={3}>
            <Card className={`shadow-sm h-100 border-0 rounded-4 hover-lift position-relative overflow-hidden fade-in-up-${idx + 1}`}>
              <c.icon size={90} className={`decor-icon text-${c.text}`} />
              <Card.Body className="d-flex align-items-center gap-3 position-relative">
                <div className={`icon-circle bg-${c.bg}`}>
                  <c.icon size={22} className={`text-${c.text}`} />
                </div>
                <div>
                  <div className="small text-muted">{c.label}</div>
                  <div className="fs-5 fw-bold">
                    <AnimatedCounter target={summary?.[c.key] || 0} format={c.key === 'totalRevenue' ? formatVND : undefined} />
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Row className="g-3 mb-4">
        <Col md={8}>
          <Card className="shadow-sm h-100 border-0 rounded-4">
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <SectionTitle>Doanh thu 7 ngày gần nhất</SectionTitle>
                <div className="text-end small">
                  <span className="text-muted">Trung bình/ngày </span>
                  <span className="fw-bold text-primary">{formatVND(avgRevenuePerDay)}</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="_id" fontSize={12} tickLine={false} />
                  <YAxis fontSize={12} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}tr`} />
                  <Tooltip
                    formatter={(value) => formatVND(value)}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2.5} fill="url(#revenueGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="shadow-sm h-100 border-0 rounded-4">
            <Card.Body>
              <SectionTitle>Trạng thái đơn hàng</SectionTitle>
              <div className="d-flex flex-column gap-3">
                {orderStatusStats.map((s) => (
                  <div key={s._id}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <Badge bg={STATUS_VARIANT[s._id] || 'secondary'} className="fw-normal">
                        {STATUS_LABEL[s._id] || s._id}
                      </Badge>
                      <span className="small fw-medium">{s.count}</span>
                    </div>
                    <ProgressBar
                      now={(s.count / totalOrdersForStatus) * 100}
                      variant={STATUS_VARIANT[s._id] || 'secondary'}
                      style={{ height: 6 }}
                    />
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3">
        <Col md={6}>
          <Card className="shadow-sm h-100 border-0 rounded-4">
            <Card.Body>
              <SectionTitle>Top sản phẩm bán chạy</SectionTitle>
              <div className="d-flex flex-column gap-3">
                {bestSelling.map((p, idx) => (
                  <div key={p._id} className="d-flex align-items-center gap-3">
                    <span
                      className="fw-bold small text-nowrap"
                      style={{ color: RANK_BADGE[idx] || '#9ca3af', minWidth: 22, flexShrink: 0 }}
                    >
                      #{idx + 1}
                    </span>
                    <img
                      src={p.featuredImage || placeholderImage(60, 60)}
                      alt={p.title}
                      style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                    />
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="small text-truncate">{p.title}</div>
                      <ProgressBar now={(p.soldCount / maxSold) * 100} variant="primary" style={{ height: 4 }} />
                    </div>
                    <div className="text-end text-nowrap">
                      <div className="small text-muted">{formatVND(p.price)}</div>
                      <div className="small fw-medium">{p.soldCount} đã bán</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="shadow-sm h-100 border-0 rounded-4">
            <Card.Body>
              <SectionTitle>Doanh thu theo cửa hàng (multi-store)</SectionTitle>
              <div className="d-flex flex-column gap-3">
                {revenueByStore.map((s) => (
                  <div key={s._id}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <div className="d-flex align-items-center gap-2">
                        <ShopWindow className="text-primary" />
                        <span className="small fw-medium">{s.store?.name}</span>
                      </div>
                      <span className="small text-muted">{s.orderCount} đơn</span>
                    </div>
                    <ProgressBar now={(s.revenue / maxStoreRevenue) * 100} variant="primary" style={{ height: 6 }} />
                    <div className="text-end small fw-bold text-primary mt-1">{formatVND(s.revenue)}</div>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
