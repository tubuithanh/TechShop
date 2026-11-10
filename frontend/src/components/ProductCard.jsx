import { useActivePromotions, promotionPrice } from '../utils/promotionPrice';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from 'react-bootstrap';
import { ArrowLeftRight, Heart, HeartFill, StarFill, Check2 } from 'react-bootstrap-icons';
import ProductImage from './ProductImage';
import { useAuth } from '../store/AuthContext';
import { userService } from '../services/userService';
import { COMPARE_KEY, toggleCompare, useLocalList } from '../utils/localLists';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

// Thẻ sản phẩm dùng chung (trang chủ, danh sách, liên quan...).
// - Ảnh nền trắng, hiển thị trọn sản phẩm (contain) -> các ảnh nền sáng/tối khác nhau vẫn đồng đều
// - Rê chuột: hiện ảnh thứ 2 + nút So sánh / Yêu thích (trên điện thoại luôn hiện)
// - Nhãn giảm giá, trả góp, đánh giá, các màu đang bán
export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const compareList = useLocalList(COMPARE_KEY);
  const inCompare = compareList.some((p) => p._id === product._id);
  const [wished, setWished] = useState(false);
  const [toast, setToast] = useState('');

  // effectivePrice (tính sẵn ở backend) xử lý đúng cả trường hợp salePrice=0 (hàng khuyến mãi miễn
  // phí) - `salePrice || price` coi 0 là falsy nên sẽ hiển thị nhầm về giá gốc.
  const basePrice = product.effectivePrice ?? (product.salePrice || product.price);
  // Khuyến mãi tự động áp dụng cho mọi khách -> trừ thẳng vào giá hiển thị
  const promotions = useActivePromotions();
  const promo = promotionPrice(product, basePrice, promotions);
  const displayPrice = promo.price;
  // Các màu đang bán (không trùng) + sản phẩm có nhiều mức giá theo phiên bản hay không (hiện "Từ ...")
  const activeVariants = (product.variants || []).filter((v) => v.isActive);
  const colors = activeVariants.filter((v, i, arr) => arr.findIndex((x) => x.color === v.color) === i);
  const hasPriceRange = new Set(activeVariants.map((v) => v.effectivePrice)).size > 1;
  const secondImage = (product.imageURLs || []).find((u) => u && u !== product.featuredImage);
  const discountPercent = displayPrice < product.price ? Math.round(100 - (displayPrice / product.price) * 100) : 0;
  const tags = (product.tags || []).slice(0, 2);

  const flash = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 1800);
  };

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCompare = (e) => {
    stop(e);
    const r = toggleCompare(product);
    if (r.full) flash('Chỉ so sánh tối đa 4 sản phẩm');
  };

  const handleWish = async (e) => {
    stop(e);
    if (!user) return navigate('/login');
    if (user.role !== 'customer') return flash('Chỉ tài khoản khách hàng dùng được');
    try {
      const res = await userService.toggleWishlist(product._id);
      setWished(res.added);
      flash(res.added ? 'Đã thêm vào yêu thích' : 'Đã bỏ khỏi yêu thích');
    } catch {
      flash('Không cập nhật được, thử lại sau');
    }
  };

  return (
    <Link to={`/products/${product.slug}`} className="product-card h-100 text-decoration-none text-reset">
      <div className="product-card-media">
        {discountPercent > 0 && <span className="product-card-discount">-{discountPercent}%</span>}
        <div className="product-card-actions">
          <button
            type="button"
            className={`product-card-action${inCompare ? ' active' : ''}`}
            onClick={handleCompare}
            title={inCompare ? 'Bỏ khỏi so sánh' : 'Thêm vào so sánh'}
            aria-label={inCompare ? `Bỏ ${product.title} khỏi so sánh` : `So sánh ${product.title}`}
            aria-pressed={inCompare}
          >
            {inCompare ? <Check2 size={15} /> : <ArrowLeftRight size={14} />}
          </button>
          <button
            type="button"
            className={`product-card-action${wished ? ' active' : ''}`}
            onClick={handleWish}
            title="Yêu thích"
            aria-label={`Yêu thích ${product.title}`}
            aria-pressed={wished}
          >
            {wished ? <HeartFill size={14} /> : <Heart size={14} />}
          </button>
        </div>
        {/* Ảnh vuông nền trắng; rê chuột thì hiện dần ảnh thứ 2 của sản phẩm (nếu có) */}
        <div className="img-zoom card-media">
          <ProductImage src={product.featuredImage} alt={product.title} size={320} fit="contain" />
          {secondImage && <ProductImage src={secondImage} alt="" size={320} fit="contain" className="card-media-alt" />}
        </div>
        {toast && <div className="product-card-toast">{toast}</div>}
      </div>

      <div className="product-card-body">
        {/* Hàng nhãn luôn chiếm chỗ (kể cả khi trống) để tên sản phẩm các card thẳng hàng nhau */}
        <div className="product-card-tags">
          {promo.promo && (
            <span className="product-card-tag" style={{ background: 'var(--bs-danger-bg-subtle)', color: 'var(--bs-danger-text-emphasis)' }} title={promo.promo.name}>
              {promo.promo.name.length > 18 ? 'Khuyến mãi' : promo.promo.name}
            </span>
          )}
          {!promo.promo && promo.extra.length > 0 && <span className="product-card-tag">Ưu đãi thành viên</span>}
          {tags.slice(0, promo.promo || promo.extra.length ? 1 : 2).map((t) => (
            <span key={t} className="product-card-tag">
              {t}
            </span>
          ))}
        </div>
        <h3 className="product-card-title line-clamp-2">{product.title}</h3>

        <div className="mt-auto">
          <div className="d-flex align-items-baseline flex-wrap gap-1">
            {hasPriceRange && <span className="small text-muted">Từ</span>}
            <span className="product-card-price">{formatVND(displayPrice)}</span>
          </div>
          {discountPercent > 0 && (
            <div className="small">
              <span className="text-muted text-decoration-line-through">{formatVND(product.price)}</span>
            </div>
          )}

          <div className="d-flex align-items-center justify-content-between gap-2 mt-2" style={{ minHeight: 18 }}>
            {product.ratingCount > 0 ? (
              <span className="product-card-rating">
                <StarFill className="text-warning" size={11} /> {product.ratingAverage}
                <span className="text-muted"> ({product.ratingCount})</span>
              </span>
            ) : (
              <span />
            )}
            {colors.length > 1 && (
              <span className="d-flex align-items-center gap-1" title={colors.map((c) => c.color).join(', ')}>
                {colors.slice(0, 4).map((c) => (
                  <span key={c.color} className="product-card-swatch" style={{ background: c.colorHex }} />
                ))}
                {colors.length > 4 && <span className="text-muted" style={{ fontSize: '0.68rem' }}>+{colors.length - 4}</span>}
              </span>
            )}
          </div>
          {product.soldCount > 0 && <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>Đã bán {product.soldCount}</div>}
        </div>
      </div>
      {discountPercent >= 15 && (
        <Badge bg="warning" text="dark" className="product-card-hot">
          Giá sốc
        </Badge>
      )}
    </Link>
  );
}
