import { Fragment, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Row, Col, Breadcrumb, Badge, Button, Form, Nav, Table, Spinner, Alert, InputGroup, Modal } from 'react-bootstrap';
import { productService } from '../services/productService';
import { userService } from '../services/userService';
import ReviewForm from '../components/ReviewForm';
import ProductGallery from '../components/ProductGallery';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import ProductCard from '../components/ProductCard';
import InstallmentCalculator from '../components/InstallmentCalculator';
import ProductQnA from '../components/ProductQnA';
import { groupSpecs } from '../utils/specs';
import { sizedImage } from '../utils/imageUrl';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

// Bộ ảnh hiển thị: ảnh chung của sản phẩm, thêm ảnh riêng của phiên bản lên đầu nếu chưa có trong bộ
function galleryImages(product, variant) {
  const base = product.imageURLs?.length ? product.imageURLs : [product.featuredImage].filter(Boolean);
  return variant?.image && !base.includes(variant.image) ? [variant.image, ...base] : base;
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
  const [zoomImage, setZoomImage] = useState(null); // ảnh đánh giá đang phóng to
  const [questions, setQuestions] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState(null); // đánh giá của khách đang được sửa
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');

  // Chọn 1 phiên bản: tự chuyển sang cửa hàng còn hàng của ĐÚNG phiên bản đó (tồn kho tính theo phiên
  // bản), đưa ảnh chính về ảnh của màu đó, và đặt lại số lượng.
  const selectVariant = (data, variant, currentStoreId) => {
    if (!variant) return;
    setSelectedVariantId(variant._id);
    setQuantity(1);
    const invs = (data.inventories || []).filter((inv) => inv.variantId === variant._id);
    const current = invs.find((inv) => inv.storeId?._id === currentStoreId && inv.stock > 0);
    const firstAvailable = invs.find((inv) => inv.stock > 0);
    setSelectedStoreId(current?.storeId?._id || firstAvailable?.storeId?._id || invs[0]?.storeId?._id || '');
    const imgs = galleryImages(data, variant);
    setActiveImage(Math.max(0, imgs.indexOf(variant.image)));
  };

  useEffect(() => {
    (async () => {
      const data = await productService.getProductBySlug(slug);
      setProduct(data);
      // Mặc định chọn phiên bản đang bán đầu tiên còn hàng ở bất kỳ cửa hàng nào
      const active = (data.variants || []).filter((v) => v.isActive);
      const inStock = active.find((v) => data.inventories?.some((inv) => inv.variantId === v._id && inv.stock > 0));
      selectVariant(data, inStock || active[0], '');

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

  const activeVariants = (product.variants || []).filter((v) => v.isActive);
  const selectedVariant = activeVariants.find((v) => v._id === selectedVariantId) || activeVariants[0];
  const colorOptions = activeVariants.filter((v, i, arr) => arr.findIndex((x) => x.color === v.color) === i);
  const storageOptions = activeVariants.filter((v) => v.color === selectedVariant?.color && v.storage);
  const displayPrice = selectedVariant?.effectivePrice ?? product.effectivePrice;
  const originalPrice = selectedVariant?.price ?? product.price;
  const specGroups = groupSpecs(product.specifications, product.categoryId?.specTemplate);
  const images = galleryImages(product, selectedVariant);
  const variantInventories = (product.inventories || []).filter((inv) => inv.variantId === selectedVariant?._id);
  const variantTotalStock = variantInventories.reduce((sum, inv) => sum + inv.stock, 0);
  const selectedInventory = variantInventories.find((inv) => inv.storeId?._id === selectedStoreId);
  const currentStock = selectedInventory?.stock || 0;

  // Đổi màu: giữ nguyên dung lượng đang chọn nếu màu mới có, ngược lại lấy phiên bản đầu tiên của màu đó
  const handleSelectColor = (color) => {
    const sameStorage = activeVariants.find((v) => v.color === color && v.storage === selectedVariant?.storage);
    selectVariant(product, sameStorage || activeVariants.find((v) => v.color === color), selectedStoreId);
  };

  const handleAddToCart = async () => {
    if (!selectedVariant) {
      setMessage('Sản phẩm hiện không có phiên bản nào đang bán');
      return;
    }
    if (!selectedStoreId) {
      setMessage('Vui lòng chọn cửa hàng trước khi thêm vào giỏ');
      return;
    }
    try {
      await addToCart(product._id, selectedVariant._id, quantity, selectedStoreId);
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

  // Đánh giá của chính khách đang đăng nhập (mỗi khách chỉ có 1 đánh giá/sản phẩm)
  const reviewOwnerId = (r) => r.userId?._id || r.userId;
  const myReview = user ? reviews.find((r) => reviewOwnerId(r) === user._id) : null;

  // Cập nhật lại điểm trung bình hiển thị trên trang theo danh sách đánh giá mới (backend đã tự tính lại)
  const syncRating = (list) => {
    const avg = list.length ? Math.round((list.reduce((sum, r) => sum + r.rating, 0) / list.length) * 10) / 10 : 0;
    setProduct((p) => ({ ...p, ratingAverage: avg, ratingCount: list.length }));
  };

  const handleCreateReview = async (values) => {
    const created = await productService.createReview(product._id, values);
    const next = [created, ...reviews];
    setReviews(next);
    syncRating(next);
  };

  const handleUpdateReview = async (values) => {
    const updated = await productService.updateReview(product._id, editingReviewId, values);
    const next = reviews.map((r) => (r._id === updated._id ? updated : r));
    setReviews(next);
    syncRating(next);
    setEditingReviewId(null);
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
          <ProductGallery
            images={images}
            title={product.title}
            active={activeImage}
            onChange={setActiveImage}
            overlay={
              <Button
                onClick={handleToggleWishlist}
                variant={isWishlisted ? 'primary' : 'light'}
                className="position-absolute top-0 end-0 mt-3 me-3 rounded-circle d-flex align-items-center justify-content-center p-0 shadow-sm"
                style={{ width: '2.25rem', height: '2.25rem', zIndex: 2 }}
                title="Thêm vào yêu thích"
              >
                {isWishlisted ? '♥' : '♡'}
              </Button>
            }
          />
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
            {displayPrice < originalPrice && (
              <span className="text-muted text-decoration-line-through ms-3">{formatVND(originalPrice)}</span>
            )}
          </div>

          {/* Chọn phiên bản: màu (ô màu) + dung lượng/kích thước của màu đó - mỗi phiên bản có giá, ảnh, tồn kho riêng */}
          {colorOptions.length > 0 && (
            <div className="mb-3">
              <div className="small fw-medium mb-2">
                Màu sắc: <span className="text-muted fw-normal">{selectedVariant?.color}</span>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {colorOptions.map((v) => (
                  <button
                    key={v.color}
                    type="button"
                    title={v.color}
                    aria-label={`Màu ${v.color}`}
                    aria-pressed={v.color === selectedVariant?.color}
                    onClick={() => handleSelectColor(v.color)}
                    className={`rounded-circle border ${v.color === selectedVariant?.color ? 'border-primary border-3' : 'border-secondary-subtle'}`}
                    style={{ width: '2.25rem', height: '2.25rem', background: v.colorHex, padding: 0 }}
                  />
                ))}
              </div>
            </div>
          )}
          {storageOptions.length > 0 && (
            <div className="mb-4">
              <div className="small fw-medium mb-2">Phiên bản</div>
              <div className="d-flex flex-wrap gap-2">
                {storageOptions.map((v) => (
                  <Button
                    key={v._id}
                    size="sm"
                    variant={v._id === selectedVariant?._id ? 'primary' : 'outline-secondary'}
                    onClick={() => selectVariant(product, v, selectedStoreId)}
                  >
                    <div className="fw-medium">{v.storage}</div>
                    <div style={{ fontSize: '0.7rem' }}>{formatVND(v.effectivePrice)}</div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Chọn cửa hàng - tồn kho khác nhau theo từng chi nhánh VÀ theo từng phiên bản */}
          <div className="mb-4">
            <div className="small fw-medium mb-1">Chọn cửa hàng để xem tồn kho ({selectedVariant?.label})</div>
            <Form.Select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="small">
              {variantInventories.map((inv) => (
                <option key={inv._id} value={inv.storeId?._id}>
                  {inv.storeId?.name} ({inv.storeId?.city}) — {inv.stock > 0 ? `Còn ${inv.stock} sản phẩm` : 'Hết hàng'}
                </option>
              ))}
            </Form.Select>
            <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
              Tổng tồn kho phiên bản này toàn hệ thống: {variantTotalStock} sản phẩm
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
              {specGroups.map((g) => (
                <Fragment key={g.group}>
                  <tr>
                    <td colSpan={2} className="bg-light fw-bold text-uppercase" style={{ fontSize: '0.8rem', letterSpacing: '0.03em' }}>
                      {g.group}
                    </td>
                  </tr>
                  {g.items.map((item) => (
                    <tr key={item.key}>
                      <td className="text-muted" style={{ width: '38%' }}>
                        {item.key}
                      </td>
                      <td>{item.value}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {specGroups.length === 0 && (
                <tr>
                  <td className="text-muted">Chưa cập nhật thông số kỹ thuật</td>
                </tr>
              )}
            </tbody>
          </Table>
        )}

        {activeTab === 'reviews' && (
          <div>
            {user && !myReview && (
              <div className="mb-4">
                <ReviewForm onSubmit={handleCreateReview} />
              </div>
            )}
            {myReview && !editingReviewId && (
              <div className="small text-muted mb-3">
                Bạn đã đánh giá sản phẩm này. Có thể sửa lại số sao, nội dung và hình ảnh ngay trong đánh giá của bạn bên dưới.
              </div>
            )}

            <div className="d-flex flex-column gap-4">
              {reviews.map((r) =>
                editingReviewId === r._id ? (
                  <div key={r._id} className="border-bottom pb-3">
                    <div className="small fw-medium mb-2">Sửa đánh giá của bạn</div>
                    <ReviewForm initial={r} submitLabel="Lưu thay đổi" onSubmit={handleUpdateReview} onCancel={() => setEditingReviewId(null)} />
                  </div>
                ) : (
                <div key={r._id} className="border-bottom pb-3">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="fw-medium small">{r.displayName || r.userId?.displayName || 'Ẩn danh'}</span>
                    <span className="text-warning" style={{ fontSize: '0.75rem' }}>
                      {'★'.repeat(r.rating)}
                    </span>
                    {r.isVerifiedPurchase && (
                      <Badge bg="success" className="bg-opacity-10 text-success fw-normal" style={{ fontSize: '0.75rem' }}>
                        Đã mua hàng
                      </Badge>
                    )}
                    {r.editedAt && <span className="text-muted" style={{ fontSize: '0.75rem' }}>(đã chỉnh sửa)</span>}
                    {myReview?._id === r._id && (
                      <Button variant="link" size="sm" className="p-0 ms-auto" onClick={() => setEditingReviewId(r._id)}>
                        ✎ Sửa đánh giá
                      </Button>
                    )}
                  </div>
                  <p className="small mt-1">{r.message}</p>
                  {r.images?.length > 0 && (
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      {r.images.map((img) => (
                        <img
                          key={img}
                          src={sizedImage(img, 160)}
                          alt="Ảnh đánh giá"
                          loading="lazy"
                          role="button"
                          onClick={() => setZoomImage(img)}
                          className="rounded border"
                          style={{ width: '4.5rem', height: '4.5rem', objectFit: 'cover' }}
                        />
                      ))}
                    </div>
                  )}
                  {r.reply?.content && (
                    <div className="bg-light rounded p-2 mt-2" style={{ fontSize: '0.75rem' }}>
                      <span className="fw-medium text-primary">Phản hồi từ TechShop: </span>
                      {r.reply.content}
                    </div>
                  )}
                </div>
                )
              )}
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
            <img src={sizedImage(images?.[0], 96)} alt="" className="d-none d-sm-block rounded" style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover' }} />
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
      <Modal show={!!zoomImage} onHide={() => setZoomImage(null)} centered size="lg">
        <Modal.Body className="p-0">
          <img src={sizedImage(zoomImage, 1000) || ''} alt="Ảnh đánh giá" className="w-100 rounded" onClick={() => setZoomImage(null)} />
        </Modal.Body>
      </Modal>
    </Container>
  );
}
