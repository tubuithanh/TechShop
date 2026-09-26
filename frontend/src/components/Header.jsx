import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Navbar, Nav, NavDropdown, Container, Form, Button, Badge, Offcanvas } from 'react-bootstrap';
import { List, Cart3, PersonCircle, Search, Telephone } from 'react-bootstrap-icons';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';
import { useSettings } from '../store/SettingsContext';
import { productService } from '../services/productService';

const MAIN_LINKS = [
  { to: '/compare', label: 'So sánh' },
  { to: '/stores', label: 'Cửa hàng' },
  { to: '/promotions', label: 'Khuyến mãi' },
  { to: '/tin-tuc', label: 'Tin tức' }
];

const ACCOUNT_LINKS = [
  { to: '/account/profile', label: 'Thông tin tài khoản' },
  { to: '/account/addresses', label: 'Sổ địa chỉ' },
  { to: '/account/wishlist', label: 'Sản phẩm yêu thích' },
  { to: '/account/orders', label: 'Đơn hàng của tôi' },
  { to: '/account/warranties', label: 'Bảo hành' },
  { to: '/account/notifications', label: 'Thông báo' }
];

// Ô tìm kiếm dùng chung cho menu máy tính và điện thoại
function SearchForm({ className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [keyword, setKeyword] = useState('');

  // Đang ở trang kết quả tìm kiếm thì hiện lại từ khóa đã tìm
  useEffect(() => {
    if (location.pathname === '/products') setKeyword(new URLSearchParams(location.search).get('keyword') || '');
  }, [location.pathname, location.search]);

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(`/products?keyword=${encodeURIComponent(keyword.trim())}`);
  };

  return (
    <Form className={`d-flex ${className}`} role="search" onSubmit={handleSearch}>
      <Form.Control
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        type="search"
        enterKeyHint="search"
        aria-label="Tìm kiếm sản phẩm"
        placeholder="Bạn cần tìm gì hôm nay?"
        className="rounded-end-0 border-0"
      />
      <Button type="submit" variant="dark" className="rounded-start-0 px-3" aria-label="Tìm">
        <Search size={16} />
      </Button>
    </Form>
  );
}

// Menu trên cùng: màn hình >= 992px hiện 1 hàng như trước; nhỏ hơn thì 2 tầng (nút ☰ + logo + tài khoản +
// giỏ hàng, bên dưới là ô tìm kiếm rộng hết màn hình) và ngăn menu trượt từ trái (danh mục, trang, tài khoản).
export default function Header() {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const firstName = (user?.displayName || user?.name || '').split(' ').pop();
  const isStaff = ['admin', 'staff'].includes(user?.role);

  // Đóng ngăn menu khi chuyển trang
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  // Danh mục chỉ cần khi mở ngăn menu lần đầu
  useEffect(() => {
    if (menuOpen && categories.length === 0) productService.getCategories().then(setCategories).catch(() => {});
  }, [menuOpen, categories.length]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/');
  };

  const cartLink = (
    <Nav.Link as={Link} to="/cart" className="header-icon-btn position-relative text-white" aria-label={`Giỏ hàng (${totalItems} sản phẩm)`}>
      <Cart3 size={22} />
      <span className="d-none d-xl-inline ms-1">Giỏ hàng</span>
      {totalItems > 0 && (
        <Badge bg="warning" text="dark" pill className="position-absolute top-0 start-100 translate-middle header-badge">
          {totalItems}
        </Badge>
      )}
    </Nav.Link>
  );

  return (
    <Navbar bg="primary" variant="dark" sticky="top" className="shadow-sm py-2 py-lg-3 site-header">
      <Container fluid="xl" className="flex-column flex-lg-row flex-nowrap align-items-stretch align-items-lg-center gap-2 gap-lg-3">
        {/* Hàng 1 (điện thoại) / toàn bộ hàng (máy tính) */}
        <div className="d-flex align-items-center gap-2 gap-lg-3 flex-lg-grow-1 min-w-0">
          <Button
            variant="link"
            className="header-icon-btn text-white d-lg-none p-0"
            aria-label="Mở menu"
            aria-controls="site-menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <List size={26} />
          </Button>

          <Navbar.Brand as={Link} to="/" className="fw-bold fs-4 text-nowrap d-flex align-items-center gap-2 me-auto me-lg-0">
            {settings.logoUrl && <img src={settings.logoUrl} alt="" height={28} />}
            {settings.siteName}
          </Navbar.Brand>

          <SearchForm className="flex-grow-1 d-none d-lg-flex" />

          <Nav className="d-none d-lg-flex align-items-center gap-lg-2 gap-xl-3 text-nowrap">
            {MAIN_LINKS.map((l) => (
              <Nav.Link key={l.to} as={NavLink} to={l.to} className="text-white">
                {l.label}
              </Nav.Link>
            ))}
          </Nav>

          <div className="d-flex align-items-center gap-1 gap-lg-3 text-nowrap">
            {cartLink}
            {user ? (
              <NavDropdown
                align="end"
                title={
                  <span className="d-inline-flex align-items-center gap-1">
                    <PersonCircle size={20} />
                    <span className="d-none d-lg-inline">{firstName}</span>
                  </span>
                }
                id="user-menu"
                className="header-user d-none d-lg-block"
              >
                {ACCOUNT_LINKS.map((l) => (
                  <NavDropdown.Item key={l.to} as={Link} to={l.to}>
                    {l.label}
                  </NavDropdown.Item>
                ))}
                {isStaff && (
                  <>
                    <NavDropdown.Divider />
                    <NavDropdown.Item as={Link} to="/admin">
                      Trang quản trị
                    </NavDropdown.Item>
                  </>
                )}
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={handleLogout} className="text-danger">
                  Đăng xuất
                </NavDropdown.Item>
              </NavDropdown>
            ) : (
              <Nav.Link as={Link} to="/login" className="header-icon-btn text-white d-none d-lg-flex align-items-center gap-1">
                <PersonCircle size={20} /> Đăng nhập
              </Nav.Link>
            )}
            {/* Điện thoại: biểu tượng tài khoản mở ngăn menu (có sẵn các mục tài khoản) hoặc tới trang đăng nhập */}
            <Nav.Link
              as={user ? 'button' : Link}
              to={user ? undefined : '/login'}
              onClick={user ? () => setMenuOpen(true) : undefined}
              className="header-icon-btn text-white d-lg-none bg-transparent border-0"
              aria-label={user ? `Tài khoản của ${firstName}` : 'Đăng nhập'}
            >
              <PersonCircle size={22} />
            </Nav.Link>
          </div>
        </div>

        {/* Hàng 2 (chỉ điện thoại, máy tính bảng): ô tìm kiếm rộng hết màn hình */}
        <SearchForm className="d-lg-none w-100" />
      </Container>

      <Offcanvas id="site-menu" show={menuOpen} onHide={() => setMenuOpen(false)} placement="start" className="site-menu" aria-labelledby="site-menu-title">
        <Offcanvas.Header closeButton closeLabel="Đóng menu" className="bg-primary text-white">
          <Offcanvas.Title id="site-menu-title" className="fw-bold">
            {user ? `Xin chào, ${firstName}` : settings.siteName}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          {!user && (
            <div className="d-flex gap-2 p-3 border-bottom">
              <Button as={Link} to="/login" variant="primary" className="flex-fill">
                Đăng nhập
              </Button>
              <Button as={Link} to="/register" variant="outline-primary" className="flex-fill">
                Đăng ký
              </Button>
            </div>
          )}

          <div className="site-menu-section">Danh mục sản phẩm</div>
          <Nav className="flex-column">
            <Nav.Link as={Link} to="/products" className="site-menu-link">
              Tất cả sản phẩm
            </Nav.Link>
            {categories.map((c) => (
              <Nav.Link key={c._id} as={Link} to={`/products?categoryId=${c._id}`} className="site-menu-link">
                {c.name}
              </Nav.Link>
            ))}
          </Nav>

          <div className="site-menu-section">Mua sắm</div>
          <Nav className="flex-column">
            {MAIN_LINKS.map((l) => (
              <Nav.Link key={l.to} as={NavLink} to={l.to} className="site-menu-link">
                {l.label}
              </Nav.Link>
            ))}
            <Nav.Link as={NavLink} to="/cart" className="site-menu-link d-flex justify-content-between">
              Giỏ hàng {totalItems > 0 && <Badge bg="primary" pill>{totalItems}</Badge>}
            </Nav.Link>
          </Nav>

          {user && (
            <>
              <div className="site-menu-section">Tài khoản</div>
              <Nav className="flex-column">
                {ACCOUNT_LINKS.map((l) => (
                  <Nav.Link key={l.to} as={NavLink} to={l.to} className="site-menu-link">
                    {l.label}
                  </Nav.Link>
                ))}
                {isStaff && (
                  <Nav.Link as={Link} to="/admin" className="site-menu-link fw-semibold">
                    Trang quản trị
                  </Nav.Link>
                )}
                <Nav.Link as="button" onClick={handleLogout} className="site-menu-link text-danger text-start border-0 bg-transparent w-100">
                  Đăng xuất
                </Nav.Link>
              </Nav>
            </>
          )}

          <div className="site-menu-section">Hỗ trợ</div>
          <Nav className="flex-column mb-3">
            <Nav.Link href={`tel:${String(settings.hotline).replace(/\s/g, '')}`} className="site-menu-link d-flex align-items-center gap-2">
              <Telephone /> Tổng đài {settings.hotline}
            </Nav.Link>
            <Nav.Link as={Link} to="/tra-cuu-bao-hanh" className="site-menu-link">
              Tra cứu bảo hành
            </Nav.Link>
            <Nav.Link as={Link} to="/huong-dan-mua-hang" className="site-menu-link">
              Hướng dẫn mua hàng
            </Nav.Link>
          </Nav>
        </Offcanvas.Body>
      </Offcanvas>
    </Navbar>
  );
}
