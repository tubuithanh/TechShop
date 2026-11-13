import { Link, Outlet, useLocation } from 'react-router-dom';
import { Container, Row, Col, ListGroup } from 'react-bootstrap';
import { useSettings } from '../../store/SettingsContext';

const menu = [
  { path: '/account/profile', label: 'Thông tin tài khoản' },
  { path: '/account/loyalty', label: 'Hạng thành viên' },
  { path: '/account/addresses', label: 'Sổ địa chỉ' },
  { path: '/account/wishlist', label: 'Sản phẩm yêu thích' },
  { path: '/account/orders', label: 'Đơn hàng của tôi' },
  { path: '/account/vouchers', label: 'Mã giảm giá của tôi' },
  { path: '/account/warranties', label: 'Bảo hành' },
  { path: '/account/notifications', label: 'Thông báo' }
];

export default function AccountLayout() {
  const location = useLocation();
  const { settings } = useSettings();
  // Admin tắt tích điểm -> ẩn mục Hạng thành viên
  const items = menu.filter((m) => m.path !== '/account/loyalty' || settings.loyalty?.enabled !== false);
  return (
    <Container fluid="xl" className="py-4">
      <Row className="g-4">
        <Col xs={12} md={3}>
          <ListGroup>
            {items.map((m) => (
              <ListGroup.Item key={m.path} as={Link} to={m.path} action active={location.pathname === m.path}>
                {m.label}
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Col>
        <Col xs={12} md={9}>
          <Outlet />
        </Col>
      </Row>
    </Container>
  );
}
