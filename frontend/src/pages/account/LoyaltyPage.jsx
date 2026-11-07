import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ProgressBar, Table, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { userService } from '../../services/userService';

// Hạng thành viên: điểm cộng khi đơn giao thành công, trừ lại khi đơn đã giao bị trả hàng
export default function LoyaltyPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    userService
      .getLoyalty()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Không tải được thông tin hạng thành viên'));
  }, []);

  if (error) return <Alert variant="warning">{error}</Alert>;
  if (!data)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  if (!data.enabled) return <Alert variant="secondary">Chương trình tích điểm thành viên đang tạm dừng. Điểm của bạn ({data.points.toLocaleString('vi-VN')} điểm) vẫn được giữ nguyên.</Alert>;

  const current = data.tiers.find((t) => t.key === data.key);
  const progress = data.next ? Math.round(((data.points - current.minPoints) / (data.next.minPoints - current.minPoints)) * 100) : 100;

  return (
    <div>
      <h1 className="fs-5 fw-bold mb-3">Hạng thành viên</h1>
      <Card className="mb-4 border-0 text-white" style={{ background: data.color }}>
        <Card.Body>
          <div className="small opacity-75">Hạng hiện tại</div>
          <div className="fs-2 fw-bold">{data.name}</div>
          <div className="mb-2">{data.points.toLocaleString('vi-VN')} điểm tích lũy</div>
          <ProgressBar now={progress} variant="light" style={{ height: '0.5rem' }} />
          <div className="small mt-2">
            {data.next
              ? `Còn ${data.next.pointsNeeded.toLocaleString('vi-VN')} điểm để lên hạng ${data.next.name}`
              : 'Bạn đang ở hạng cao nhất'}
          </div>
        </Card.Body>
      </Card>

      <Row className="g-2 mb-4">
        {data.tiers.map((t) => (
          <Col key={t.key} xs={6} md={3}>
            <div className={`border rounded p-2 text-center small h-100 ${t.key === data.key ? 'border-2 border-primary' : ''}`}>
              <div className="fw-bold" style={{ color: t.color }}>
                {t.name}
              </div>
              <div className="text-muted">từ {t.minPoints.toLocaleString('vi-VN')} điểm</div>
            </div>
          </Col>
        ))}
      </Row>
      <p className="small text-muted">
        Mỗi {data.pointValue.toLocaleString('vi-VN')}đ tiền hàng (sau giảm giá, không tính phí vận chuyển) được 1 điểm, cộng khi
        bạn nhận hàng thành công. Đơn đã giao bị trả hàng sẽ bị trừ lại số điểm đã cộng.
      </p>

      <h2 className="fs-6 fw-bold mt-4">Lịch sử điểm</h2>
      {data.history.length === 0 ? (
        <div className="small text-muted">Chưa có đơn hàng nào được cộng điểm.</div>
      ) : (
        <Table size="sm" className="small">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Đơn hàng</th>
              <th>Nội dung</th>
              <th className="text-end">Điểm</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.orderId}>
                <td>{new Date(h.date).toLocaleDateString('vi-VN')}</td>
                <td>
                  <Link to={`/account/orders/${h.orderId}`}>#{h.orderCode}</Link>
                </td>
                <td>{h.points > 0 ? 'Giao hàng thành công' : 'Trả hàng (trừ điểm đã cộng)'}</td>
                <td className={`text-end fw-medium ${h.points > 0 ? 'text-success' : 'text-danger'}`}>
                  {h.points > 0 ? '+' : ''}
                  {h.points.toLocaleString('vi-VN')}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
