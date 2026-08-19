import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Navbar, Nav, NavDropdown, Container, Form, Button, Badge } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';
import { useSettings } from '../store/SettingsContext';

export default function Header() {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(`/products?keyword=${encodeURIComponent(keyword)}`);
  };

  return (
    <Navbar bg="primary" variant="dark" sticky="top" className="shadow-sm py-3">
      <Container fluid="xl" className="flex-nowrap gap-3">
        <Navbar.Brand as={Link} to="/" className="fw-bold fs-4 text-nowrap d-flex align-items-center gap-2">
          {settings.logoUrl && <img src={settings.logoUrl} alt={settings.siteName} height={28} />}
          {settings.siteName}
        </Navbar.Brand>

        <Form className="d-flex flex-grow-1" onSubmit={handleSearch}>
          <Form.Control
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="text"
            placeholder="Bạn cần tìm gì hôm nay?"
            className="rounded-end-0"
          />
          <Button type="submit" variant="dark" className="rounded-start-0">
            Tìm
          </Button>
        </Form>

        <Nav className="d-none d-sm-flex align-items-center gap-3 text-nowrap">
          <Nav.Link as={Link} to="/compare" className="text-white">
            So sánh
          </Nav.Link>
          <Nav.Link as={Link} to="/stores" className="text-white">
            Cửa hàng
          </Nav.Link>
          <Nav.Link as={Link} to="/promotions" className="text-white">
            Khuyến mãi
          </Nav.Link>
          <Nav.Link as={Link} to="/tin-tuc" className="text-white">
            Tin tức
          </Nav.Link>
        </Nav>

        <Nav.Link as={Link} to="/cart" className="position-relative text-white text-nowrap">
          Giỏ hàng
          {totalItems > 0 && (
            <Badge bg="warning" text="dark" pill className="position-absolute top-0 start-100 translate-middle">
              {totalItems}
            </Badge>
          )}
        </Nav.Link>

        {user ? (
          <NavDropdown
            align="end"
            title={`👤 ${(user.displayName || user.name || '').split(' ').pop()}`}
            id="user-menu"
            className="text-nowrap"
          >
            <NavDropdown.Item as={Link} to="/account/profile">
              Thông tin tài khoản
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/account/addresses">
              Sổ địa chỉ
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/account/wishlist">
              Sản phẩm yêu thích
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/account/orders">
              Đơn hàng của tôi
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/account/warranties">
              Bảo hành
            </NavDropdown.Item>
            <NavDropdown.Item as={Link} to="/account/notifications">
              Thông báo
            </NavDropdown.Item>
            {['admin', 'staff'].includes(user.role) && (
              <>
                <NavDropdown.Divider />
                <NavDropdown.Item as={Link} to="/admin">
                  Trang quản trị
                </NavDropdown.Item>
              </>
            )}
            <NavDropdown.Divider />
            <NavDropdown.Item
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="text-danger"
            >
              Đăng xuất
            </NavDropdown.Item>
          </NavDropdown>
        ) : (
          <Nav.Link as={Link} to="/login" className="text-white text-nowrap">
            Đăng nhập
          </Nav.Link>
        )}
      </Container>
    </Navbar>
  );
}
