import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Row, Col, Table } from 'react-bootstrap';
import { dashboardService } from '../../services/dashboardService';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [bestSelling, setBestSelling] = useState([]);
  const [revenueByStore, setRevenueByStore] = useState([]);

  useEffect(() => {
    dashboardService.getSummary().then(setSummary);
    dashboardService.getRevenueByDay(7).then(setRevenueData);
    dashboardService.getBestSelling(5).then(setBestSelling);
    dashboardService.getRevenueByStore().then(setRevenueByStore);
  }, []);

  return (
    <div>
      <h1 className="fs-4 fw-bold mb-4">Tổng quan hệ thống</h1>

      <Row className="g-3 mb-4">
        <Col xs={6} md={3}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <div className="small text-muted">Tổng doanh thu (đã giao)</div>
              <div className="fs-5 fw-bold text-primary">{formatVND(summary?.totalRevenue || 0)}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <div className="small text-muted">Tổng đơn hàng</div>
              <div className="fs-5 fw-bold">{summary?.totalOrders ?? '-'}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <div className="small text-muted">Khách hàng</div>
              <div className="fs-5 fw-bold">{summary?.totalCustomers ?? '-'}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <div className="small text-muted">Sản phẩm đang bán</div>
              <div className="fs-5 fw-bold">{summary?.totalProducts ?? '-'}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm mb-4">
        <Card.Body>
          <h3 className="fw-medium fs-6 mb-3">Doanh thu 7 ngày gần nhất</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="_id" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value) => formatVND(value)} />
              <Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card.Body>
      </Card>

      <Row className="g-3">
        <Col md={6}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <h3 className="fw-medium fs-6 mb-3">Top sản phẩm bán chạy</h3>
              <Table size="sm" hover responsive className="mb-0">
                <thead>
                  <tr className="text-muted">
                    <th>Sản phẩm</th>
                    <th>Giá</th>
                    <th>Đã bán</th>
                  </tr>
                </thead>
                <tbody>
                  {bestSelling.map((p) => (
                    <tr key={p._id}>
                      <td>{p.title}</td>
                      <td>{formatVND(p.price)}</td>
                      <td>{p.soldCount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <h3 className="fw-medium fs-6 mb-3">Doanh thu theo cửa hàng (multi-store)</h3>
              <Table size="sm" hover responsive className="mb-0">
                <thead>
                  <tr className="text-muted">
                    <th>Cửa hàng</th>
                    <th>Doanh thu</th>
                    <th>Số đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByStore.map((s) => (
                    <tr key={s._id}>
                      <td>{s.store?.name}</td>
                      <td>{formatVND(s.revenue)}</td>
                      <td>{s.orderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
