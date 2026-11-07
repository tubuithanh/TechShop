import { Link } from 'react-router-dom';
import { Card, Badge } from 'react-bootstrap';
import ProductImage from './ProductImage';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function ProductCard({ product }) {
  // effectivePrice (tính sẵn ở backend) xử lý đúng cả trường hợp salePrice=0 (hàng khuyến mãi miễn
  // phí) - `salePrice || price` coi 0 là falsy nên sẽ hiển thị nhầm về giá gốc.
  const displayPrice = product.effectivePrice ?? (product.salePrice || product.price);
  // Các màu đang bán (không trùng) + sản phẩm có nhiều mức giá theo phiên bản hay không (hiện "Từ ...")
  const activeVariants = (product.variants || []).filter((v) => v.isActive);
  const colors = activeVariants.filter((v, i, arr) => arr.findIndex((x) => x.color === v.color) === i);
  const hasPriceRange = new Set(activeVariants.map((v) => v.effectivePrice)).size > 1;
  const secondImage = (product.imageURLs || []).find((u) => u && u !== product.featuredImage);
  const discountPercent =
    product.salePrice != null && product.salePrice < product.price
      ? Math.round(100 - (product.salePrice / product.price) * 100)
      : 0;

  return (
    <Card
      as={Link}
      to={`/products/${product.slug}`}
      className="h-100 position-relative text-decoration-none text-reset hover-lift border-0 shadow-sm"
    >
      {discountPercent > 0 && (
        <Badge bg="primary" className="position-absolute top-0 start-0 m-2 z-1">
          -{discountPercent}%
        </Badge>
      )}
      {/* Ảnh vuông phủ kín khung; rê chuột thì hiện dần ảnh thứ 2 của sản phẩm (nếu có) */}
      <div className="img-zoom card-media rounded-top">
        <ProductImage src={product.featuredImage} alt={product.title} size={320} />
        {secondImage && <ProductImage src={secondImage} alt="" size={320} className="card-media-alt" />}
      </div>
      <Card.Body className="pt-0">
        <Card.Title as="h3" className="fs-6 fw-medium line-clamp-2 mt-3" style={{ height: '2.5rem' }}>
          {product.title}
        </Card.Title>
        <div className="mt-1">
          {hasPriceRange && <span className="small text-muted">Từ </span>}
          <span className="text-primary fw-bold">{formatVND(displayPrice)}</span>
          {product.salePrice != null && product.salePrice < product.price && (
            <span className="text-muted small text-decoration-line-through ms-2">{formatVND(product.price)}</span>
          )}
        </div>
        {colors.length > 1 && (
          <div className="d-flex align-items-center gap-1 mt-1" title={colors.map((c) => c.color).join(', ')}>
            {colors.slice(0, 5).map((c) => (
              <span
                key={c.color}
                className="rounded-circle border d-inline-block"
                style={{ width: '0.75rem', height: '0.75rem', background: c.colorHex }}
              />
            ))}
            {colors.length > 5 && <span className="text-muted" style={{ fontSize: '0.7rem' }}>+{colors.length - 5}</span>}
          </div>
        )}
        {product.ratingCount > 0 && (
          <div className="text-warning mt-1" style={{ fontSize: '0.75rem' }}>
            ★ {product.ratingAverage} ({product.ratingCount} đánh giá)
          </div>
        )}
        {product.tags?.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mt-1">
            {product.tags.map((t) => (
              <Badge key={t} bg="light" text="dark" className="fw-normal" style={{ fontSize: '0.625rem' }}>
                {t}
              </Badge>
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
