import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { placeholderImage } from '../utils/placeholderImage';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CartPage() {
  const { cart, refreshCart, updateQuantity, removeFromCart, totalAmount } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) refreshCart();
  }, [user]);

  if (!user) {
    return (
      <Container style={{ maxWidth: '48rem' }} className="py-5 text-center">
        <p className="mb-3">Vui lòng đăng nhập để xem giỏ hàng của bạn.</p>
        <Link to="/login" className="text-primary text-decoration-underline">
          Đăng nhập ngay
        </Link>
      </Container>
    );
  }

  if (!cart.items || cart.items.length === 0) {
    return (
      <Container style={{ maxWidth: '48rem' }} className="py-5 text-center">
        <p className="mb-3">Giỏ hàng của bạn đang trống.</p>
        <Link to="/products" className="text-primary text-decoration-underline">
          Tiếp tục mua sắm
        </Link>
      </Container>
    );
  }

  return (
    <Container style={{ maxWidth: '64rem' }} className="py-4">
      <h1 className="fs-4 fw-bold mb-4">Giỏ hàng của bạn</h1>
      <Row className="g-4">
        <Col md={8} className="d-flex flex-column gap-3">
          {cart.items.map((item) => (
            <Card key={item._id}>
              <Card.Body className="d-flex align-items-center gap-3 p-3">
                <img
                  src={item.image || placeholderImage(80, 80)}
                  alt={item.name}
                  style={{ width: '5rem', height: '5rem', objectFit: 'contain' }}
                />
                <div className="flex-grow-1">
                  <div className="fw-medium small">{item.name}</div>
                  <div className="text-primary fw-bold">{formatVND(item.unitPrice)}</div>
                </div>
                <div className="d-flex align-items-center border rounded">
                  <Button variant="light" size="sm" onClick={() => updateQuantity(item._id, item.quantity - 1)}>
                    -
                  </Button>
                  <span className="px-3">{item.quantity}</span>
                  <Button variant="light" size="sm" onClick={() => updateQuantity(item._id, item.quantity + 1)}>
                    +
                  </Button>
                </div>
                <Button variant="link" size="sm" className="text-danger" onClick={() => removeFromCart(item._id)}>
                  Xóa
                </Button>
              </Card.Body>
            </Card>
          ))}
        </Col>

        <Col md={4}>
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between mb-2">
                <span>Tạm tính</span>
                <span className="fw-bold">{formatVND(totalAmount)}</span>
              </div>
              <p className="small text-muted mb-3">Phí vận chuyển sẽ được tính ở bước thanh toán</p>
              <Button variant="primary" className="w-100 fw-medium py-2" onClick={() => navigate('/checkout')}>
                Tiến hành thanh toán
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
