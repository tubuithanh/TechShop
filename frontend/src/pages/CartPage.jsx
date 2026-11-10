import { useEffect, useState } from 'react';
import { orderService } from '../services/orderService';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Badge } from 'react-bootstrap';
import { Cart3, Trash, ShieldCheck, Truck, BoxArrowInRight, Dash, Plus } from 'react-bootstrap-icons';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import ProductImage from '../components/ProductImage';
import CheckoutSteps from '../components/CheckoutSteps';
import RecentlyViewed from '../components/RecentlyViewed';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CartPage() {
  const { cart, refreshCart, updateQuantity, removeFromCart, totalAmount, totalItems } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const changeQuantity = async (itemId, quantity) => {
    try {
      await updateQuantity(itemId, quantity);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật số lượng');
    }
  };

  useEffect(() => {
    if (user) refreshCart();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Khuyến mãi tự động của giỏ hiện tại (backend tính; chưa chọn chi nhánh nên chỉ gồm khuyến mãi không
  // giới hạn chi nhánh - ưu đãi theo chi nhánh / mã giảm giá được tính thêm ở bước thanh toán)
  const [promo, setPromo] = useState(null);
  const cartKey = (cart.items || []).map((i) => `${i.variantId}x${i.quantity}`).join(',');
  useEffect(() => {
    if (!user || user.role !== 'customer' || !cartKey) { setPromo(null); return undefined; }
    let alive = true;
    orderService.quote({ deliveryMethod: 'store_pickup' })
      .then((q) => { if (alive) setPromo(q); })
      .catch(() => { if (alive) setPromo(null); });
    return () => { alive = false; };
  }, [user, cartKey]);
  const promotionDiscount = promo?.promotionDiscount || 0;

  if (!user) {
    return (
      <Container style={{ maxWidth: '48rem' }} className="py-5">
        <div className="empty-state">
          <BoxArrowInRight size={40} />
          <div className="fw-semibold mt-2">Đăng nhập để xem giỏ hàng</div>
          <div className="small text-muted mb-3">Giỏ hàng được lưu theo tài khoản, dùng được trên mọi thiết bị</div>
          <Button as={Link} to="/login" className="px-4">
            Đăng nhập ngay
          </Button>
        </div>
      </Container>
    );
  }

  if (!cart.items || cart.items.length === 0) {
    return (
      <Container fluid="xl" className="py-5">
        <div className="empty-state mb-5">
          <Cart3 size={44} />
          <div className="fw-semibold mt-2">Giỏ hàng của bạn đang trống</div>
          <div className="small text-muted mb-3">Khám phá hàng nghìn sản phẩm công nghệ chính hãng</div>
          <Button as={Link} to="/products" className="px-4">
            Tiếp tục mua sắm
          </Button>
        </div>
        <RecentlyViewed />
      </Container>
    );
  }

  return (
    <Container style={{ maxWidth: '68rem' }} className="py-4">
      <CheckoutSteps current={0} />
      <div className="d-flex align-items-baseline justify-content-between mb-3">
        <h1 className="fs-4 fw-bold mb-0">Giỏ hàng của bạn</h1>
        <Link to="/products" className="small text-decoration-none">
          ← Mua thêm sản phẩm
        </Link>
      </div>
      <Row className="g-4">
        <Col lg={8} className="d-flex flex-column gap-3">
          {cart.items.map((item) => (
            <Card key={item._id} className={`cart-item${item.availability && item.availability !== 'ok' ? ' border-danger' : ''}`}>
              <Card.Body className="d-flex gap-3 p-3">
                <ProductImage src={item.image} alt={item.name} size={120} fit="contain" className="rounded-3 flex-shrink-0 bg-white border" style={{ width: '5.5rem' }} />
                <div className="flex-grow-1 min-w-0 d-flex flex-column">
                  <div className="d-flex justify-content-between gap-2">
                    <div className="min-w-0">
                      <div className="fw-medium line-clamp-2">{item.name}</div>
                      {item.variantLabel && <div className="text-muted small">{item.variantLabel}</div>}
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-muted p-0 align-self-start"
                      aria-label={`Xóa ${item.name} khỏi giỏ`}
                      title="Xóa khỏi giỏ"
                      onClick={() => removeFromCart(item._id)}
                    >
                      <Trash />
                    </Button>
                  </div>
                  {item.availability === 'unavailable' && (
                    <Badge bg="danger" className="fw-normal mt-1 align-self-start">Phiên bản này đã ngừng bán - vui lòng xóa khỏi giỏ</Badge>
                  )}
                  {item.availability === 'out_of_stock' && (
                    <Badge bg="warning" text="dark" className="fw-normal mt-1 align-self-start">
                      {item.stock > 0 ? `Chỉ còn ${item.stock} sản phẩm - vui lòng giảm số lượng` : 'Tạm hết hàng'}
                    </Badge>
                  )}
                  <div className="d-flex align-items-end justify-content-between mt-auto pt-2 gap-2 flex-wrap">
                    <div className="qty-stepper" role="group" aria-label="Số lượng">
                      <button type="button" aria-label="Giảm" disabled={item.quantity <= 1} onClick={() => changeQuantity(item._id, item.quantity - 1)}>
                        <Dash />
                      </button>
                      <span aria-live="polite">{item.quantity}</span>
                      <button type="button" aria-label="Tăng" onClick={() => changeQuantity(item._id, item.quantity + 1)}>
                        <Plus />
                      </button>
                    </div>
                    <div className="text-end">
                      <div className="text-primary fw-bold">{formatVND(item.unitPrice * item.quantity)}</div>
                      {item.quantity > 1 && <div className="small text-muted">{formatVND(item.unitPrice)} / sản phẩm</div>}
                    </div>
                  </div>
                </div>
              </Card.Body>
            </Card>
          ))}
        </Col>

        <Col lg={4}>
          <Card className="cart-summary">
            <Card.Body>
              <div className="fw-bold mb-3">Tóm tắt đơn hàng</div>
              <div className="d-flex justify-content-between mb-2 small">
                <span className="text-muted">Tạm tính ({totalItems} sản phẩm)</span>
                <span>{formatVND(totalAmount)}</span>
              </div>
              {(promo?.promotions || []).map((p) => (
                <div key={p.promotionId} className="d-flex justify-content-between mb-2 small text-success">
                  <span>Khuyến mãi: {p.name}</span>
                  <span>-{formatVND(p.amount)}</span>
                </div>
              ))}
              <div className="d-flex justify-content-between mb-2 small">
                <span className="text-muted">Phí vận chuyển</span>
                <span>Tính ở bước sau</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between align-items-baseline mb-3">
                <span className="fw-semibold">Tổng tạm tính</span>
                <span className="fs-5 fw-bold text-primary">{formatVND(totalAmount - promotionDiscount)}</span>
              </div>
              {cart.hasUnavailable && (
                <p className="small text-danger mb-2">Giỏ hàng có sản phẩm ngừng bán hoặc không đủ hàng, hãy điều chỉnh trước khi thanh toán.</p>
              )}
              <Button variant="primary" className="w-100 fw-semibold py-2" disabled={cart.hasUnavailable} onClick={() => navigate('/checkout')}>
                Tiến hành đặt hàng
              </Button>
              <div className="small text-muted mt-3 d-flex flex-column gap-1">
                <span>
                  <ShieldCheck className="text-success me-1" /> Thanh toán an toàn: COD, VNPay, MoMo
                </span>
                <span>
                  <Truck className="text-success me-1" /> Giao tận nơi hoặc nhận tại cửa hàng
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
