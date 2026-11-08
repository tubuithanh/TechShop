import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Navbar, Nav, NavDropdown, Container, Form, Button, Badge, Offcanvas } from 'react-bootstrap';
import {
  List,
  Cart3,
  PersonCircle,
  Search,
  Telephone,
  Phone,
  Laptop,
  Tablet,
  Watch,
  Headphones,
  Display,
  Plug,
  Grid3x3GapFill,
  LightningChargeFill,
  MoonStars,
  Sun
} from 'react-bootstrap-icons';
import ProductImage from './ProductImage';
import { useColorMode } from '../utils/colorMode';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';
import { useSettings } from '../store/SettingsContext';
import { firstAdminPath } from '../utils/permissions';
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

const CATEGORY_ICONS = {
  'dien-thoai': Phone,
  laptop: Laptop,
  'may-tinh-bang': Tablet,
  'dong-ho-thong-minh': Watch,
  'tai-nghe-loa': Headphones,
  'man-hinh': Display,
  'phu-kien': Plug
};
export const categoryIcon = (slug) => CATEGORY_ICONS[slug] || Grid3x3GapFill;
const vnd = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';

// Ô tìm kiếm dùng chung cho menu máy tính và điện thoại - gõ là hiện gợi ý (ảnh, tên, giá) sau 250ms;
// ↑/↓ chọn gợi ý, Enter mở sản phẩm đang chọn hoặc trang kết quả, Esc đóng.
function SearchForm({ className = '', idPrefix }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const listId = `${idPrefix}-suggest`;

  // Đang ở trang kết quả tìm kiếm thì hiện lại từ khóa đã tìm
  useEffect(() => {
    if (location.pathname === '/products') setKeyword(new URLSearchParams(location.search).get('keyword') || '');
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const q = keyword.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let ignore = false;
    setSearching(true);
    const t = setTimeout(() => {
      productService
        .getProducts({ keyword: q, limit: 6 })
        .then((res) => !ignore && setSuggestions(res.data || []))
        .catch(() => !ignore && setSuggestions([]))
        .finally(() => !ignore && setSearching(false));
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(t);
    };
  }, [keyword]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (active >= 0 && suggestions[active]) {
      navigate(`/products/${suggestions[active].slug}`);
    } else {
      navigate(`/products?keyword=${encodeURIComponent(keyword.trim())}`);
    }
    setOpen(false);
    e.currentTarget.querySelector('input')?.blur();
  };

  const showBox = open && keyword.trim().length >= 2;

  return (
    <Form className={`header-search position-relative ${className}`} role="search" onSubmit={handleSearch}>
      <div className="d-flex">
        <Form.Control
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, -1));
            } else if (e.key === 'Escape') setOpen(false);
          }}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={showBox}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Tìm kiếm sản phẩm"
          placeholder="Bạn cần tìm gì hôm nay?"
          className="rounded-end-0 border-0"
        />
        <Button type="submit" variant="dark" className="rounded-start-0 px-3" aria-label="Tìm">
          <Search size={16} />
        </Button>
      </div>
      {showBox && (
        <div className="search-suggest shadow" id={listId} role="listbox">
          {searching && suggestions.length === 0 && <div className="p-3 small text-muted">Đang tìm…</div>}
          {!searching && suggestions.length === 0 && <div className="p-3 small text-muted">Không có sản phẩm phù hợp với "{keyword.trim()}"</div>}
          {suggestions.map((p, i) => (
            <Link
              key={p._id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              to={`/products/${p.slug}`}
              className={`search-suggest-item${i === active ? ' active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
            >
              <ProductImage src={p.featuredImage} alt="" size={96} fit="contain" className="search-suggest-img" />
              <span className="flex-grow-1 min-w-0">
                <span className="d-block small text-truncate">{p.title}</span>
                <span className="d-block small fw-bold text-primary">{vnd(p.effectivePrice ?? (p.salePrice || p.price))}</span>
              </span>
            </Link>
          ))}
          {suggestions.length > 0 && (
            <button type="submit" className="search-suggest-all" onMouseDown={(e) => e.preventDefault()}>
              Xem tất cả kết quả cho "{keyword.trim()}" →
            </button>
          )}
        </div>
      )}
    </Form>
  );
}

// Nút "Danh mục" (máy tính): rê chuột / bấm để mở bảng danh mục có biểu tượng
function CategoryMenu({ categories }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  return (
    <div className="header-cats d-none d-lg-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="header-cats-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Grid3x3GapFill size={16} /> <span className="d-none d-xl-inline">Danh mục</span>
      </button>
      {open && (
        <div className="header-cats-panel shadow-lg">
          <Link to="/products" className="header-cats-item">
            <span className="header-cats-icon">
              <Grid3x3GapFill />
            </span>
            Tất cả sản phẩm
          </Link>
          {categories.map((c) => {
            const Icon = categoryIcon(c.slug);
            return (
              <Link key={c._id} to={`/products?categoryId=${c._id}`} className="header-cats-item">
                <span className="header-cats-icon">
                  <Icon />
                </span>
                {c.name}
              </Link>
            );
          })}
          <Link to="/promotions" className="header-cats-item text-primary fw-semibold">
            <span className="header-cats-icon">
              <LightningChargeFill />
            </span>
            Khuyến mãi hot
          </Link>
        </div>
      )}
    </div>
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
  const [scrolled, setScrolled] = useState(false);
  const [colorMode, toggleColorMode] = useColorMode();

  // Cuộn xuống -> header thu gọn (bớt khoảng đệm) để nhường chỗ cho nội dung
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const firstName = (user?.displayName || user?.name || '').split(' ').pop();
  // Trang quản trị đầu tiên tài khoản được vào (nhân viên chỉ có quyền giao hàng không có Dashboard)
  const adminHome = firstAdminPath(user);
  const isStaff = ['admin', 'staff'].includes(user?.role) && Boolean(adminHome);

  // Đóng ngăn menu khi chuyển trang
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  // Danh mục dùng cho nút "Danh mục" (máy tính) và ngăn menu (điện thoại)
  useEffect(() => {
    productService.getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/');
  };

  const cartLink = (
    <Nav.Link as={Link} to="/cart" className="header-icon-btn position-relative text-white" aria-label={`Giỏ hàng (${totalItems} sản phẩm)`} data-cart-target="">
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
    <Navbar bg="primary" variant="dark" sticky="top" className={`shadow-sm site-header${scrolled ? ' is-scrolled' : ''}`}>
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

          <CategoryMenu categories={categories} />

          <SearchForm className="flex-grow-1 d-none d-lg-block" idPrefix="search-desktop" />

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
                    <NavDropdown.Item as={Link} to={adminHome}>
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
        <SearchForm className="d-lg-none w-100" idPrefix="search-mobile" />
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
                  <Nav.Link as={Link} to={adminHome} className="site-menu-link fw-semibold">
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
