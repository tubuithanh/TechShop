import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Button, Spinner } from 'react-bootstrap';
import api from '../services/api';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function PromotionsPage() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');

  useEffect(() => {
    api
      .get('/vouchers/active')
      .then((res) => setVouchers(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 1500);
  };

  return (
    <Container fluid="xl" style={{ maxWidth: '56rem' }} className="py-4">
      <h1 className="fs-3 fw-bold mb-2">Khuyến mãi & Ưu đãi</h1>
      <p className="small text-muted mb-4">Sao chép mã và áp dụng ngay tại bước thanh toán</p>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-5 text-muted">Hiện chưa có chương trình khuyến mãi nào</div>
      ) : (
        <Row className="g-3">
          {vouchers.map((v) => (
            <Col key={v.code} xs={12} md={6}>
              <Card className="border-2 border-primary bg-primary bg-opacity-10 h-100" style={{ borderStyle: 'dashed' }}>
                <Card.Body className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-bold text-primary fs-5">{v.code}</div>
                    <div className="small">{v.description}</div>
                    <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                      {v.discountType === 'percent'
                        ? `Giảm ${v.discountValue}%${v.maxDiscountAmount ? ` (tối đa ${formatVND(v.maxDiscountAmount)})` : ''}`
                        : `Giảm ${formatVND(v.discountValue)}`}
                      {v.minOrderValue > 0 && ` — Đơn tối thiểu ${formatVND(v.minOrderValue)}`}
                    </div>
                  </div>
                  <Button variant="primary" size="sm" className="text-nowrap" onClick={() => handleCopy(v.code)}>
                    {copiedCode === v.code ? 'Đã sao chép!' : 'Sao chép mã'}
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  );
}
