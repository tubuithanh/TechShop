import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Row, Col, Breadcrumb, Badge, Button, Form, Nav, Table, Spinner, Alert, InputGroup } from 'react-bootstrap';
import { productService } from '../services/productService';
import { userService } from '../services/userService';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import ProductCard from '../components/ProductCard';
import InstallmentCalculator from '../components/InstallmentCalculator';
import ProductQnA from '../components/ProductQnA';
import { placeholderImage } from '../utils/placeholderImage';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

const TABS = [
  { id: 'description', label: 'Mô tả sản phẩm' },
  { id: 'specs', label: 'Thông số kỹ thuật' },
  { id: 'reviews', label: 'Đánh giá' },
  { id: 'qna', label: 'Hỏi đáp' }
];

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [related, setRelated] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, message: '' });
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  useEffect(() => {
    (async () => {
      const data = await productService.getProductBySlug(slug);
      setProduct(data);
      setActiveImage(0);
      // Mặc định chọn cửa hàng đầu tiên còn hàng
      const firstAvailable = data.inventories?.find((inv) => inv.stock > 0);
      setSelectedStoreId(firstAvailable?.storeId?._id || data.inventories?.[0]?.storeId?._id || '');

      const [rel, rev, qna] = await Promise.all([
        productService.getRelated(data._id),
        productService.getReviews(data._id),
        productService.getQuestions(data._id)
      ]);
      setRelated(rel);
      setReviews(rev);
      setQuestions(qna);

      if (user) {
        const wishlist = await userService.getWishlist();
        setIsWishlisted(wishlist.some((p) => p._id === data._id));
      }
    })();
  }, [slug, user]);

  useEffect(() => {
    const handleScroll = () => setShowStickyBar(window.scrollY > 480);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!product)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  const displayPrice = product.salePrice || product.price;
  const images = product.imageURLs?.length ? product.imageURLs : [product.featuredImage];
  const selectedInventory = product.inventories?.find((inv) => inv.storeId?._id === selectedStoreId);
  const currentStock = selectedInventory?.stock || 0;

  const handleAddToCart = async () => {
    if (!selectedStoreId) {
      setMessage('Vui lòng chọn cửa hàng trước khi thêm vào giỏ');
      return;
    }
    try {
      await addToCart(product._id, quantity, selectedStoreId);
      setMessage('Đã thêm vào giỏ hàng!');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleToggleWishlist = async () => {
    if (!user) {
      setMessage('Vui lòng đăng nhập để thêm vào yêu thích');
      return;
    }
    const res = await userService.toggleWishlist(product._id);
    setIsWishlisted(res.added);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    const created = await productService.createReview(product._id, newReview);
    setReviews([created, ...reviews]);
    setNewReview({ rating: 5, message: '' });
  };

  return (
    <Container fluid="xl" className="py-4 pb-5">
      <Breadcrumb style={{ fontSize: '0.75rem' }} className="mb-4">
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '/' }}>
          Trang chủ
        </Breadcrumb.Item>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: `/products?categoryId=${product.categoryId?._id}` }}>
          {product.categoryId?.name}
        </Breadcrumb.Item>
        <Breadcrumb.Item active>{product.title}</Breadcrumb.Item>
      </Breadcrumb>

      <Row className="g-4 g-md-5">
        <Col xs={12} md={6}>
          <div className="border rounded-3 overflow-hidden mb-2 position-relative">
            <img
              src={images?.[activeImage] || placeholderImage(500, 500)}
              alt={product.title}
              className="w-100"
              style={{ aspectRatio: '1 / 1', objectFit: 'contain' }}
            />
            <Button
              onClick={handleToggleWishlist}
              variant={isWishlisted ? 'primary' : 'light'}
              className="position-absolute top-0 end-0 mt-3 me-3 rounded-circle d-flex align-items-center justify-content-center p-0 shadow-sm"
              style={{ width: '2.25rem', height: '2.25rem' }}
              title="Thêm vào yêu thích"
            >
              {isWishlisted ? '♥' : '♡'}
            </Button>
          </div>
          {images?.length > 1 && (
            <div className="d-flex gap-2 overflow-auto">
              {images.map((img, idx) => (
                <Button
                  key={idx}
                  variant="light"
                  onClick={() => setActiveImage(idx)}
                  className={`flex-shrink-0 border rounded p-0 overflow-hidden ${
                    activeImage === idx ? 'border-primary border-2' : ''
                  }`}
                  style={{ width: '4rem', height: '4rem' }}
                >
                  <img src={img} alt="" className="w-100 h-100" style={{ objectFit: 'contain' }} />
                </Button>
              ))}
            </div>
          )}
        </Col>

        <Col xs={12} md={6}>
          <h1 className="fs-4 fw-bold mb-2">{product.title}</h1>
          <div className="small text-muted mb-2">Thương hiệu: {product.brandId?.name}</div>

          {product.ratingCount > 0 && (
            <Button
              variant="link"
              onClick={() => setActiveTab('reviews')}
              className="text-warning small mb-3 d-block p-0 text-decoration-none"
            >
              ★ {product.ratingAverage} ({product.ratingCount} đánh giá) · Đã bán {product.soldCount}
            </Button>
          )}

          <div className="mb-4">
            <span className="fs-3 text-primary fw-bold">{formatVND(displayPrice)}</span>
            {product.salePrice && product.salePrice < product.price && (
              <span className="text-muted text-decoration-line-through ms-3">{formatVND(product.price)}</span>
            )}
          </div>

          {/* Chọn cửa hàng - mô hình multi-store: tồn kho khác nhau theo từng chi nhánh */}
          <div className="mb-4">
            <div className="small fw-medium mb-1">Chọn cửa hàng để xem tồn kho</div>
            <Form.Select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="small">
              {product.inventories?.map((inv) => (
                <option key={inv._id} value={inv.storeId?._id}>
                  {inv.storeId?.name} ({inv.storeId?.city}) — {inv.stock > 0 ? `Còn ${inv.stock} sản phẩm` : 'Hết hàng'}
                </option>
              ))}
            </Form.Select>
            <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
              Tổng tồn kho toàn hệ thống: {product.totalStock} sản phẩm
            </div>
          </div>

          <div className="small mb-3">
            {currentStock > 0 ? (
              <span className="text-success">✓ Còn hàng tại cửa hàng đã chọn ({currentStock} sản phẩm)</span>
            ) : (
              <span className="text-danger">Hết hàng tại cửa hàng này, vui lòng chọn cửa hàng khác</span>
            )}
          </div>

          <div className="d-flex align-items-center gap-3 mb-4">
            <span className="small">Số lượng:</span>
            <InputGroup style={{ width: 'auto' }}>
              <Button variant="outline-secondary" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                -
              </Button>
              <InputGroup.Text className="px-4">{quantity}</InputGroup.Text>
              <Button
                variant="outline-secondary"
                onClick={() => setQuantity(Math.min(currentStock || 1, quantity + 1))}
              >
                +
              </Button>
            </InputGroup>
          </div>

          <div className="d-flex gap-3 mb-2">
            <Button
              onClick={handleAddToCart}
              disabled={currentStock === 0}
              variant="primary"
              className="flex-fill fw-medium py-3"
            >
              {currentStock === 0 ? 'Hết hàng tại cửa hàng này' : 'Thêm vào giỏ hàng'}
            </Button>
          </div>
          {message && (
            <Alert variant="success" className="py-1 px-2 small mb-2">
              {message}
            </Alert>
          )}

          <InstallmentCalculator price={displayPrice} />

          <div className="bg-light rounded p-3 small text-muted mt-3">
            🛡️ Bảo hành chính hãng {product.warrantyMonths} tháng. Miễn phí đổi trả trong 30 ngày nếu lỗi nhà sản
            xuất.
          </div>
        </Col>
      </Row>

      <Nav variant="tabs" className="mt-5 flex-nowrap overflow-auto" activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
        {TABS.map((tab) => (
          <Nav.Item key={tab.id}>
            <Nav.Link eventKey={tab.id} className="text-nowrap small">
              {tab.label}
              {tab.id === 'reviews' && ` (${reviews.length})`}
              {tab.id === 'qna' && ` (${questions.length})`}
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      <div className="py-4">
        {activeTab === 'description' && (
          <p className="small" style={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {product.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}
          </p>
        )}

        {activeTab === 'specs' && (
          <Table className="small" style={{ maxWidth: '42rem' }}>
            <tbody>
              {Object.entries(product.specifications || {}).map(([key, val]) => (
                <tr key={key}>
                  <td className="text-muted" style={{ width: '33%' }}>
                    {key}
                  </td>
                  <td>{val}</td>
                </tr>
              ))}
              {Object.keys(product.specifications || {}).length === 0 && (
                <tr>
                  <td className="text-muted">Chưa cập nhật thông số kỹ thuật</td>
                </tr>
              )}
            </tbody>
          </Table>
        )}

        {activeTab === 'reviews' && (
          <div>
            {user && (
              <Form onSubmit={handleSubmitReview} className="border rounded-3 p-4 mb-4" style={{ maxWidth: '32rem' }}>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span className="small">Chấm điểm:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      type="button"
                      variant="link"
                      key={star}
                      onClick={() => setNewReview({ ...newReview, rating: star })}
                      className={`p-0 text-decoration-none ${star <= newReview.rating ? 'text-warning' : 'text-secondary'}`}
                    >
                      ★
                    </Button>
                  ))}
                </div>
                <Form.Control
                  as="textarea"
                  value={newReview.message}
                  onChange={(e) => setNewReview({ ...newReview, message: e.target.value })}
                  placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."
                  className="small mb-2"
                  rows={3}
                />
                <Button type="submit" variant="primary" size="sm">
                  Gửi đánh giá
                </Button>
              </Form>
            )}

            <div className="d-flex flex-column gap-4">
              {reviews.map((r) => (
                <div key={r._id} className="border-bottom pb-3">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-medium small">{r.displayName || r.userId?.displayName || 'Ẩn danh'}</span>
                    <span className="text-warning" style={{ fontSize: '0.75rem' }}>
                      {'★'.repeat(r.rating)}
                    </span>
                    {r.isVerifiedPurchase && (
                      <Badge bg="success" className="bg-opacity-10 text-success fw-normal" style={{ fontSize: '0.75rem' }}>
                        Đã mua hàng
                      </Badge>
                    )}
                  </div>
                  <p className="small mt-1">{r.message}</p>
                  {r.reply?.content && (
                    <div className="bg-light rounded p-2 mt-2" style={{ fontSize: '0.75rem' }}>
                      <span className="fw-medium text-primary">Phản hồi từ TechShop: </span>
                      {r.reply.content}
                    </div>
                  )}
                </div>
              ))}
              {reviews.length === 0 && <div className="small text-muted">Chưa có đánh giá nào</div>}
            </div>
          </div>
        )}

        {activeTab === 'qna' && (
          <ProductQnA productId={product._id} questions={questions} setQuestions={setQuestions} />
        )}
      </div>

      {related.length > 0 && (
        <div className="mt-5">
          <h3 className="fw-bold mb-3 fs-5">Sản phẩm liên quan</h3>
          <Row className="g-3">
            {related.map((p) => (
              <Col key={p._id} xs={6} md={3}>
                <ProductCard product={p} />
              </Col>
            ))}
          </Row>
        </div>
      )}

      {showStickyBar && (
        <div className="position-fixed bottom-0 start-0 end-0 bg-white border-top shadow-lg py-3 px-4" style={{ zIndex: 1030 }}>
          <Container fluid="xl" className="d-flex align-items-center gap-4">
            <img src={images?.[0]} alt="" className="d-none d-sm-block" style={{ width: '2.5rem', height: '2.5rem', objectFit: 'contain' }} />
            <div className="flex-fill text-truncate">
              <div className="small fw-medium text-truncate">{product.title}</div>
              <div className="text-primary fw-bold">{formatVND(displayPrice)}</div>
            </div>
            <Button
              onClick={handleAddToCart}
              disabled={currentStock === 0}
              variant="primary"
              className="fw-medium px-4 py-2 text-nowrap"
            >
              Thêm vào giỏ
            </Button>
          </Container>
        </div>
      )}
    </Container>
  );
}
