import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Spinner, Badge } from 'react-bootstrap';
import { Lightning } from 'react-bootstrap-icons';
import api from '../services/api';
import { promotionService } from '../services/promotionService';

function formatVND(value) {
  return (value || 0).toLocaleString('vi-VN') + 'đ';
}

const names = (list, key = 'name') => (list || []).map((x) => x?.[key]).filter(Boolean);

// Điều kiện áp dụng dạng chữ cho khách đọc: "Danh mục Laptop · Chi nhánh Q1 · Hạng Vàng"
function conditions(item) {
  const parts = [];
  if (item.categoryIds?.length) parts.push(`Danh mục ${names(item.categoryIds).join(', ')}`);
  if (item.brandIds?.length) parts.push(`Thương hiệu ${names(item.brandIds).join(', ')}`);
  if (item.productIds?.length) {
    const titles = names(item.productIds, 'title');
    parts.push(titles.length <= 3 ? titles.join(', ') : `${titles.slice(0, 3).join(', ')} và ${titles.length - 3} sản phẩm khác`);
  }
  if (item.storeIds?.length) parts.push(`Chỉ tại ${names(item.storeIds).join(', ')}`);
  if (item.tierNames?.length) parts.push(`Thành viên hạng ${item.tierNames.join(', ')}`);
  return parts;
}

export default function PromotionsPage() {
  const [vouchers, setVouchers] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/vouchers/active').then((res) => res.data.data).catch(() => []),
      promotionService.getActive().catch(() => [])
    ])
      .then(([v, p]) => { setVouchers(v); setPromotions(p); })
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
      <p className="small text-muted mb-4">Chương trình giảm giá được trừ tự động khi thanh toán; mã giảm giá được trừ thêm sau đó.</p>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : vouchers.length === 0 && promotions.length === 0 ? (
        <div className="text-center py-5 text-muted">Hiện chưa có chương trình khuyến mãi nào</div>
      ) : (
        <>
          {promotions.length > 0 && (
            <>
              <h2 className="fs-5 fw-bold mb-3 d-flex align-items-center gap-2"><Lightning className="text-warning" /> Đang giảm giá tự động</h2>
              <Row className="g-3 mb-5">
                {promotions.map((p) => (
                  <Col key={p._id} xs={12} md={6}>
                    <Card className="h-100 border-0 shadow-sm">
                      <Card.Body>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="fw-bold">{p.name}</div>
                          <Badge bg="danger" className="fs-6">
                            {p.discountType === 'percent' ? `-${p.discountValue}%` : `-${formatVND(p.discountValue)}`}
                          </Badge>
                        </div>
                        {p.description && <div className="small mt-1">{p.description}</div>}
                        <ul className="small text-muted mt-2 mb-2 ps-3">
                          {(conditions(p).length ? conditions(p) : ['Áp dụng cho mọi sản phẩm']).map((c) => <li key={c}>{c}</li>)}
                          {p.maxDiscountPerItem && <li>Giảm tối đa {formatVND(p.maxDiscountPerItem)} mỗi sản phẩm</li>}
                        </ul>
                        <div className="d-flex justify-content-between align-items-center small">
                          <span className="text-muted">Đến hết {new Date(p.endDate).toLocaleDateString('vi-VN')}</span>
                          {p.productIds?.length === 1 && p.productIds[0].slug && (
                            <Link to={`/products/${p.productIds[0].slug}`}>Xem sản phẩm</Link>
                          )}
                          {p.categoryIds?.length === 1 && (
                            <Link to={`/products?categoryId=${p.categoryIds[0]._id}`}>Mua ngay</Link>
                          )}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}

          {vouchers.length > 0 && (
            <>
              <h2 className="fs-5 fw-bold mb-3">Mã giảm giá</h2>
              <Row className="g-3">
                {vouchers.map((v) => (
                  <Col key={v.code} xs={12} md={6}>
                    <Card className="border-2 border-primary bg-primary bg-opacity-10 h-100" style={{ borderStyle: 'dashed' }}>
                      <Card.Body className="d-flex justify-content-between align-items-center gap-2">
                        <div>
                          <div className="fw-bold text-primary fs-5">{v.code}</div>
                          <div className="small">{v.description}</div>
                          <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                            {v.discountType === 'percent'
                              ? `Giảm ${v.discountValue}%${v.maxDiscountAmount ? ` (tối đa ${formatVND(v.maxDiscountAmount)})` : ''}`
                              : `Giảm ${formatVND(v.discountValue)}`}
                            {v.minOrderValue > 0 && ` — Đơn tối thiểu ${formatVND(v.minOrderValue)}`}
                          </div>
                          {conditions(v).map((c) => (
                            <div key={c} className="text-muted" style={{ fontSize: '0.75rem' }}>• {c}</div>
                          ))}
                        </div>
                        <Button variant="primary" size="sm" className="text-nowrap" onClick={() => handleCopy(v.code)}>
                          {copiedCode === v.code ? 'Đã sao chép!' : 'Sao chép mã'}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}
        </>
      )}
    </Container>
  );
}
