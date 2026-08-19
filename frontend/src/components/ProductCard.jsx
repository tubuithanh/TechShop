import { Link } from 'react-router-dom';
import { Card, Badge } from 'react-bootstrap';
import { placeholderImage } from '../utils/placeholderImage';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function ProductCard({ product }) {
  const displayPrice = product.salePrice || product.price;
  const discountPercent =
    product.salePrice && product.salePrice < product.price
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
      <div className="img-zoom">
        <Card.Img
          variant="top"
          src={product.featuredImage || placeholderImage(300, 300)}
          alt={product.title}
          className="p-3"
          style={{ height: '10rem', objectFit: 'contain' }}
        />
      </div>
      <Card.Body className="pt-0">
        <Card.Title as="h3" className="fs-6 fw-medium line-clamp-2" style={{ height: '2.5rem' }}>
          {product.title}
        </Card.Title>
        <div className="mt-1">
          <span className="text-primary fw-bold">{formatVND(displayPrice)}</span>
          {product.salePrice && product.salePrice < product.price && (
            <span className="text-muted small text-decoration-line-through ms-2">{formatVND(product.price)}</span>
          )}
        </div>
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
