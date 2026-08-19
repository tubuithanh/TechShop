import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Spinner, Carousel, Nav, Badge, Button, Card, ProgressBar } from 'react-bootstrap';
import {
  Phone, Laptop, Tablet, Watch, Headphones, Display, Plug,
  Truck, ArrowRepeat, ShieldCheck, Headset, LightningChargeFill, GeoAltFill, StarFill,
  Boxes, Award, ShopWindow
} from 'react-bootstrap-icons';
import { productService } from '../services/productService';
import { collectionService } from '../services/collectionService';
import { postService } from '../services/postService';
import { storeService } from '../services/storeService';
import ProductCard from '../components/ProductCard';

const CATEGORY_STYLE = {
  'dien-thoai': { icon: Phone, bg: 'primary-subtle', text: 'primary-emphasis' },
  laptop: { icon: Laptop, bg: 'info-subtle', text: 'info-emphasis' },
  'may-tinh-bang': { icon: Tablet, bg: 'success-subtle', text: 'success-emphasis' },
  'dong-ho-thong-minh': { icon: Watch, bg: 'warning-subtle', text: 'warning-emphasis' },
  'tai-nghe-loa': { icon: Headphones, bg: 'danger-subtle', text: 'danger-emphasis' },
  'man-hinh': { icon: Display, bg: 'secondary-subtle', text: 'secondary-emphasis' },
  'phu-kien': { icon: Plug, bg: 'dark-subtle', text: 'dark-emphasis' }
};

const HERO_SLIDES = [
  {
    gradient: 'linear-gradient(135deg, #dc2626, #f97316)',
    eyebrow: '🎓 Đồ án tốt nghiệp MERN Stack',
    title: 'Chào mừng đến với TechShop',
    subtitle: 'Website thương mại điện tử đa chi nhánh (multi-store) — mua sắm thiết bị công nghệ chính hãng, nhanh chóng và tin cậy',
    cta: { label: 'Khám phá ngay', to: '/products' }
  },
  {
    gradient: 'linear-gradient(135deg, #7c3aed, #db2777)',
    eyebrow: '⚡ Ưu đãi mỗi ngày',
    title: 'Flash Sale giảm đến 25%',
    subtitle: 'Hàng nghìn sản phẩm công nghệ chính hãng đang được săn đón — số lượng có hạn',
    cta: { label: 'Săn deal ngay', to: '/products?sort=price_asc' }
  },
  {
    gradient: 'linear-gradient(135deg, #0891b2, #059669)',
    eyebrow: '💳 Linh hoạt tài chính',
    title: 'Trả góp 0% lãi suất',
    subtitle: 'Sở hữu ngay điện thoại, laptop yêu thích với thủ tục nhanh gọn, duyệt trong 15 phút',
    cta: { label: 'Xem ưu đãi', to: '/promotions' }
  }
];

const TRUST_ITEMS = [
  { icon: Truck, title: 'Giao hàng nhanh', desc: 'Nội thành trong 2 giờ', bg: 'primary-subtle', text: 'primary-emphasis' },
  { icon: ArrowRepeat, title: 'Đổi trả dễ dàng', desc: 'Trong vòng 7 ngày', bg: 'success-subtle', text: 'success-emphasis' },
  { icon: ShieldCheck, title: 'Bảo hành chính hãng', desc: 'Lên đến 24 tháng', bg: 'info-subtle', text: 'info-emphasis' },
  { icon: Headset, title: 'Hỗ trợ 24/7', desc: 'Tư vấn tận tâm', bg: 'warning-subtle', text: 'warning-emphasis' }
];

const TABS = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'best_selling', label: 'Bán chạy' },
  { key: 'top_rated', label: 'Đánh giá cao' }
];

function useCountdown(hours) {
  const [remaining, setRemaining] = useState(hours * 3600 * 1000);
  useEffect(() => {
    const target = Date.now() + hours * 3600 * 1000;
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hours]);
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    hh: String(Math.floor(totalSeconds / 3600)).padStart(2, '0'),
    mm: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
    ss: String(totalSeconds % 60).padStart(2, '0')
  };
}

// Hiệu ứng xuất hiện dần khi cuộn tới phần tử (IntersectionObserver)
function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}

// Số đếm tăng dần từ 0 tới target khi phần tử xuất hiện trong khung nhìn
function AnimatedCounter({ target, suffix = '', decimals = 0 }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          const duration = 900;
          const start = performance.now();
          const step = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = target * (1 - Math.pow(1 - progress, 3));
            setValue(Number(eased.toFixed(decimals)));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, decimals]);
  return (
    <span ref={ref}>
      {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString('vi-VN')}
      {suffix}
    </span>
  );
}

function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <h2 className="fs-5 fw-bold mb-0 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        {Icon && <Icon className="text-primary" />} {children}
      </h2>
      {action}
    </div>
  );
}

// Card sản phẩm Flash Sale kèm thanh tiến độ "đã bán" để tạo cảm giác khan hiếm
function FlashSaleCard({ product }) {
  const soldPercent = Math.min(92, 15 + (product.soldCount % 80));
  return (
    <div className="h-100 d-flex flex-column">
      <ProductCard product={product} />
      <div className="mt-2 px-1">
        <div className="d-flex justify-content-between text-muted mb-1" style={{ fontSize: '0.7rem' }}>
          <span>Đã bán {product.soldCount}</span>
          <span>{soldPercent}%</span>
        </div>
        <ProgressBar now={soldPercent} variant="danger" style={{ height: 6 }} />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [collections, setCollections] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stores, setStores] = useState([]);
  const [tabProducts, setTabProducts] = useState({ newest: [], best_selling: [], top_rated: [] });
  const [flashSale, setFlashSale] = useState([]);
  const [activeTab, setActiveTab] = useState('newest');
  const [loading, setLoading] = useState(true);
  const countdown = useCountdown(6);

  useEffect(() => {
    (async () => {
      try {
        const [newest, bestSelling, topRated, saleCandidates, categoryRes, brandRes, collectionRes, postRes, storeRes] =
          await Promise.all([
            productService.getProducts({ sort: 'newest', limit: 8 }),
            productService.getProducts({ sort: 'best_selling', limit: 8 }),
            productService.getProducts({ sort: 'top_rated', limit: 8 }),
            productService.getProducts({ sort: 'newest', limit: 40 }),
            productService.getCategories(),
            productService.getBrands(),
            collectionService.getCollections(),
            postService.getPosts({ limit: 3 }),
            storeService.getStores()
          ]);

        setTabProducts({ newest: newest.data, best_selling: bestSelling.data, top_rated: topRated.data });

        const discounted = saleCandidates.data
          .filter((p) => p.salePrice && p.salePrice < p.price)
          .map((p) => ({ ...p, __discount: Math.round(100 - (p.salePrice / p.price) * 100) }))
          .sort((a, b) => b.__discount - a.__discount)
          .slice(0, 8);
        setFlashSale(discounted);

        setCategories(categoryRes);
        setBrands(brandRes);
        setCollections(collectionRes);
        setPosts(postRes);
        setStores(storeRes);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cities = [...new Set(stores.map((s) => s.city))];

  const STATS = [
    { icon: Boxes, value: 1000, suffix: '+', label: 'Sản phẩm chính hãng' },
    { icon: ShopWindow, value: stores.length, suffix: '', label: 'Cửa hàng toàn quốc' },
    { icon: Award, value: brands.length, suffix: '', label: 'Thương hiệu lớn' },
    { icon: StarFill, value: 4.6, suffix: '/5', decimals: 1, label: 'Đánh giá trung bình' }
  ];

  return (
    <Container fluid="xl" className="py-4 py-md-5">
      {/* ===== Hero banner carousel ===== */}
      <Carousel className="mb-4 rounded-4 overflow-hidden shadow" indicators controls fade>
        {HERO_SLIDES.map((slide) => (
          <Carousel.Item key={slide.title}>
            <div
              className="text-white d-flex align-items-center p-4 p-md-5 position-relative overflow-hidden"
              style={{ background: slide.gradient, minHeight: '280px' }}
            >
              <div className="hero-dots" />
              <div className="hero-decor" style={{ width: 260, height: 260, top: -80, right: -60 }} />
              <div className="hero-decor" style={{ width: 160, height: 160, bottom: -60, right: 120 }} />
              <div className="position-relative" style={{ maxWidth: '34rem' }}>
                <Badge bg="light" text="dark" className="rounded-pill fw-medium mb-3 px-3 py-2">
                  {slide.eyebrow}
                </Badge>
                <h1 className="fs-1 fw-bold mb-3">{slide.title}</h1>
                <p className="mb-4 fs-6" style={{ opacity: 0.92 }}>
                  {slide.subtitle}
                </p>
                <Button as={Link} to={slide.cta.to} variant="light" size="lg" className="fw-semibold rounded-pill px-4">
                  {slide.cta.label}
                </Button>
              </div>
            </div>
          </Carousel.Item>
        ))}
      </Carousel>

      {/* ===== Con số ấn tượng ===== */}
      <Reveal className="mb-5">
        <Row className="g-3 text-center">
          {STATS.map((s) => (
            <Col key={s.label} xs={6} md={3}>
              <div className="bg-white border-0 rounded-4 shadow-sm py-4 h-100">
                <s.icon size={22} className="text-primary mb-2" />
                <div className="fs-3 fw-bold">
                  <AnimatedCounter target={s.value} suffix={s.suffix} decimals={s.decimals || 0} />
                </div>
                <div className="text-muted small">{s.label}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Reveal>

      {/* ===== Cam kết dịch vụ ===== */}
      <Reveal className="mb-5">
        <Row className="g-3">
          {TRUST_ITEMS.map((item) => (
            <Col key={item.title} xs={6} md={3}>
              <div className="d-flex align-items-center gap-3 bg-white border-0 rounded-4 p-3 h-100 shadow-sm hover-lift">
                <div className={`icon-circle bg-${item.bg}`}>
                  <item.icon size={22} className={`text-${item.text}`} />
                </div>
                <div>
                  <div className="fw-semibold small">{item.title}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {item.desc}
                  </div>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Reveal>

      {/* ===== Danh mục nổi bật ===== */}
      <Reveal className="mb-5">
        <SectionTitle>Danh mục nổi bật</SectionTitle>
        <Row className="g-3">
          {categories.map((c) => {
            const style = CATEGORY_STYLE[c.slug] || { icon: Plug, bg: 'primary-subtle', text: 'primary-emphasis' };
            const Icon = style.icon;
            return (
              <Col key={c._id} xs={4} sm={3} md={2}>
                <Link
                  to={`/products?categoryId=${c._id}`}
                  className="d-flex flex-column align-items-center gap-2 bg-white border-0 rounded-4 py-4 text-decoration-none text-dark shadow-sm h-100 hover-lift"
                >
                  <div className={`icon-circle bg-${style.bg}`}>
                    <Icon size={24} className={`text-${style.text}`} />
                  </div>
                  <span className="small text-center fw-semibold">{c.name}</span>
                </Link>
              </Col>
            );
          })}
        </Row>
      </Reveal>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" className="mb-2" />
          <div className="text-muted">Đang tải dữ liệu...</div>
        </div>
      ) : (
        <>
          {/* ===== Flash Sale ===== */}
          {flashSale.length > 0 && (
            <Reveal className="mb-5">
              <div
                className="rounded-4 p-3 p-md-4"
                style={{ background: 'linear-gradient(135deg, #fff1f0, #fff7ed)', border: '1px solid #fecaca' }}
              >
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                  <h2 className="fs-5 fw-bold mb-0 d-flex align-items-center gap-2">
                    <LightningChargeFill className="text-warning pulse-soft" size={22} /> Flash Sale
                  </h2>
                  <div className="d-flex align-items-center gap-2">
                    <span className="small text-muted d-none d-sm-inline">Kết thúc sau</span>
                    <div className="d-flex gap-1">
                      {[countdown.hh, countdown.mm, countdown.ss].map((v, i) => (
                        <Badge key={i} bg="dark" className="countdown-box text-center py-2 fs-6 rounded-3">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <Row className="g-3 row-cols-2 row-cols-md-4">
                  {flashSale.map((p) => (
                    <Col key={p._id}>
                      <FlashSaleCard product={p} />
                    </Col>
                  ))}
                </Row>
              </div>
            </Reveal>
          )}

          {/* ===== Tabs sản phẩm ===== */}
          <Reveal className="mb-5">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <Nav variant="pills" activeKey={activeTab} onSelect={(k) => setActiveTab(k)} className="gap-2">
                {TABS.map((t) => (
                  <Nav.Item key={t.key}>
                    <Nav.Link eventKey={t.key} className="rounded-pill fw-medium">
                      {t.label}
                    </Nav.Link>
                  </Nav.Item>
                ))}
              </Nav>
              <Link to={`/products?sort=${activeTab}`} className="text-primary fw-medium text-decoration-none small">
                Xem tất cả →
              </Link>
            </div>
            <Row className="g-3 row-cols-2 row-cols-md-4">
              {tabProducts[activeTab].map((p) => (
                <Col key={p._id}>
                  <ProductCard product={p} />
                </Col>
              ))}
            </Row>
          </Reveal>

          {/* ===== Bộ sưu tập nổi bật ===== */}
          {collections.map((col) => (
            <Reveal key={col._id} className="mb-5">
              <SectionTitle icon={StarFill}>
                <span>
                  {col.title}
                  {col.subTitle && <span className="d-block text-muted small fw-normal">{col.subTitle}</span>}
                </span>
              </SectionTitle>
              <Row className="g-3 row-cols-2 row-cols-md-4">
                {col.productIds.slice(0, 8).map((p) => (
                  <Col key={p._id}>
                    <ProductCard product={p} />
                  </Col>
                ))}
              </Row>
            </Reveal>
          ))}

          {/* ===== Thương hiệu nổi bật ===== */}
          {brands.length > 0 && (
            <Reveal className="mb-5">
              <SectionTitle>Thương hiệu nổi bật</SectionTitle>
              <div className="d-flex flex-wrap gap-2">
                {brands.map((b) => (
                  <Link
                    key={b._id}
                    to={`/products?brandId=${b._id}`}
                    className="border-0 rounded-pill px-3 py-2 text-decoration-none text-dark bg-white small fw-medium shadow-sm hover-lift"
                  >
                    {b.name}
                  </Link>
                ))}
              </div>
            </Reveal>
          )}

          {/* ===== Tin tức mới nhất ===== */}
          {posts.length > 0 && (
            <Reveal className="mb-5">
              <SectionTitle
                action={
                  <Link to="/tin-tuc" className="text-primary fw-medium text-decoration-none small">
                    Xem tất cả →
                  </Link>
                }
              >
                Tin tức & cẩm nang
              </SectionTitle>
              <Row className="g-3">
                {posts.map((p) => (
                  <Col key={p._id} xs={12} md={4}>
                    <Card
                      as={Link}
                      to={`/tin-tuc/${p.slug}`}
                      className="h-100 text-decoration-none text-reset border-0 shadow-sm hover-lift"
                    >
                      {p.featuredImage && (
                        <div className="img-zoom">
                          <Card.Img variant="top" src={p.featuredImage} style={{ height: '10rem', objectFit: 'cover' }} />
                        </div>
                      )}
                      <Card.Body>
                        <Card.Title className="fs-6 fw-medium line-clamp-2">{p.title}</Card.Title>
                        <Card.Text className="small text-muted line-clamp-2">{p.shortDescription}</Card.Text>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Reveal>
          )}

          {/* ===== Hệ thống cửa hàng ===== */}
          {stores.length > 0 && (
            <Reveal>
              <div
                className="rounded-4 p-4 p-md-5 text-white d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 position-relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #111827, #374151)' }}
              >
                <div className="hero-decor" style={{ width: 220, height: 220, top: -70, right: -40 }} />
                <div className="position-relative">
                  <h2 className="fs-4 fw-bold mb-2 d-flex align-items-center gap-2">
                    <GeoAltFill /> Hệ thống {stores.length} cửa hàng trên toàn quốc
                  </h2>
                  <p className="mb-0" style={{ opacity: 0.85 }}>
                    Có mặt tại {cities.join(', ')} — đến trải nghiệm sản phẩm trực tiếp ngay hôm nay
                  </p>
                </div>
                <Button
                  as={Link}
                  to="/stores"
                  variant="light"
                  size="lg"
                  className="fw-semibold text-nowrap rounded-pill px-4 position-relative"
                >
                  Xem địa chỉ cửa hàng
                </Button>
              </div>
            </Reveal>
          )}
        </>
      )}
    </Container>
  );
}
