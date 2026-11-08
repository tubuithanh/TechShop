import { Col } from 'react-bootstrap';

// Khung xương của card sản phẩm khi đang tải - giữ đúng bố cục để trang không bị "nhảy" khi dữ liệu về.
export function ProductCardSkeleton() {
  return (
    <div className="product-card h-100" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '1 / 1' }} />
      <div className="p-3">
        <div className="skeleton rounded mb-2" style={{ height: 12, width: '90%' }} />
        <div className="skeleton rounded mb-3" style={{ height: 12, width: '60%' }} />
        <div className="skeleton rounded mb-2" style={{ height: 16, width: '45%' }} />
        <div className="skeleton rounded" style={{ height: 10, width: '35%' }} />
      </div>
    </div>
  );
}

// n card khung xương bọc trong cột lưới (dùng thay cho Spinner ở danh sách sản phẩm)
export default function ProductGridSkeleton({ count = 8, colProps = { xs: 6, md: 4 } }) {
  return Array.from({ length: count }, (_, i) => (
    <Col key={i} {...colProps}>
      <ProductCardSkeleton />
    </Col>
  ));
}
