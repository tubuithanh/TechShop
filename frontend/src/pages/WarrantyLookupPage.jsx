import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Container, Card, Form, Button, Alert, Badge, Breadcrumb, Row, Col } from 'react-bootstrap';
import { warrantyService } from '../services/warrantyService';
import { WARRANTY_METHOD_LABEL, WARRANTY_STATUS_LABEL, WARRANTY_STATUS_VARIANT, WARRANTY_STATUS_OPTIONS } from '../constants/warranty';
import ProductImage from '../components/ProductImage';
import { useSettings } from '../store/SettingsContext';

const fmtDate = (d) => new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

// Tra cứu tình trạng phiếu bảo hành bằng mã phiếu + số điện thoại đặt hàng (không cần đăng nhập)
export default function WarrantyLookupPage() {
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = `Tra cứu bảo hành | ${settings.siteName || 'TechShop'}`;
  }, [settings.siteName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      setResult(await warrantyService.track(code, phone));
      setParams({ code: code.trim().toUpperCase() }, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Không tra cứu được, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  // Bước đã qua = có trong lịch sử xử lý hoặc là trạng thái hiện tại (bước "Chờ linh kiện" có thể không xảy ra)
  const reached = new Set(result ? [...result.timeline.map((h) => h.status), result.status] : []);

  return (
    <Container fluid="xl" className="py-4" style={{ maxWidth: '48rem' }}>
      <Breadcrumb style={{ fontSize: '0.75rem' }} className="mb-2">
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '/' }}>
          Trang chủ
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Tra cứu bảo hành</Breadcrumb.Item>
      </Breadcrumb>
      <h1 className="fs-3 fw-bold mb-1">Tra cứu bảo hành</h1>
      <p className="text-muted mb-4">
        Nhập mã phiếu bảo hành (in trên biên nhận hoặc trong mục <Link to="/account/warranties">Bảo hành</Link> của
        tài khoản) và số điện thoại đã dùng khi đặt hàng.
      </p>

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-4">
          <Form onSubmit={handleSubmit}>
            <Row className="g-3 align-items-end">
              <Col md={5}>
                <Form.Group controlId="lookup-code">
                  <Form.Label className="small fw-medium">Mã phiếu bảo hành</Form.Label>
                  <Form.Control required placeholder="VD: BH1234567890" value={code} onChange={(e) => setCode(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="lookup-phone">
                  <Form.Label className="small fw-medium">Số điện thoại</Form.Label>
                  <Form.Control required type="tel" inputMode="tel" placeholder="VD: 0912345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Button type="submit" className="w-100" disabled={loading}>
                  {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                </Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      {error && <Alert variant="warning">{error}</Alert>}

      {result && (
        <Card className="border-0 shadow-sm">
          <Card.Body className="p-4">
            <div className="d-flex gap-3 align-items-center mb-3">
              <ProductImage src={result.productImage} alt={result.productName} size={96} className="rounded flex-shrink-0" style={{ width: '4.5rem' }} />
              <div className="flex-grow-1">
                <div className="fw-semibold">{result.productName}</div>
                <div className="small text-muted">
                  Phiếu <strong>{result.ticketCode}</strong>
                  {result.orderCode && <> · Đơn hàng {result.orderCode}</>} · Tiếp nhận {fmtDate(result.createdAt)}
                </div>
              </div>
              <Badge bg={WARRANTY_STATUS_VARIANT[result.status] || 'secondary'} className="fs-6 fw-medium">
                {WARRANTY_STATUS_LABEL[result.status] || result.status}
              </Badge>
            </div>

            {/* Các bước xử lý */}
            <div className="d-flex flex-wrap gap-2 mb-4">
              {WARRANTY_STATUS_OPTIONS.map((s, i) => (
                <span
                  key={s}
                  className={`small rounded-pill px-3 py-1 ${reached.has(s) ? 'bg-primary text-white' : 'bg-body-tertiary text-muted'}`}
                >
                  {i + 1}. {WARRANTY_STATUS_LABEL[s]}
                </span>
              ))}
            </div>

            <div className="small mb-3">
              Hình thức: <strong>{WARRANTY_METHOD_LABEL[result.method] || result.method}</strong>
              {result.cost > 0 && (
                <>
                  {' '}
                  · Chi phí sửa chữa: <strong>{result.cost.toLocaleString('vi-VN')}đ</strong>
                </>
              )}
            </div>

            <div className="small fw-semibold mb-2">Lịch sử xử lý</div>
            <ul className="list-unstyled small mb-0 border-start ps-3">
              {[...result.timeline].reverse().map((h, i) => (
                <li key={i} className="mb-2">
                  <div className="fw-medium">{WARRANTY_STATUS_LABEL[h.status] || h.status}</div>
                  <div className="text-muted">
                    {fmtDate(h.changedAt)}
                    {h.note && <> · {h.note}</>}
                  </div>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      <p className="small text-muted mt-4 mb-0">
        Xem thêm <Link to="/chinh-sach-bao-hanh">Chính sách bảo hành</Link> · Cần hỗ trợ? Gọi {settings.hotline}
      </p>
    </Container>
  );
}
