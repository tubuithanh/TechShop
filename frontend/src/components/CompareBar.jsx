import { Link, useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { X, PlusLg, ArrowLeftRight } from 'react-bootstrap-icons';
import ProductImage from './ProductImage';
import { COMPARE_KEY, COMPARE_MAX, clearCompare, removeCompare, useLocalList } from '../utils/localLists';

// Thanh so sánh nổi ở đáy màn hình: hiện khi khách đã chọn >= 1 sản phẩm bằng nút "So sánh" trên card.
export default function CompareBar() {
  const list = useLocalList(COMPARE_KEY);
  const { pathname } = useLocation();
  if (!list.length || pathname === '/compare') return null;
  const slots = Array.from({ length: COMPARE_MAX }, (_, i) => list[i]);

  return (
    <div className="compare-bar shadow-lg" role="region" aria-label="Sản phẩm đang chọn để so sánh">
      <div className="d-flex align-items-center gap-2 gap-md-3">
        <div className="d-none d-md-flex align-items-center gap-2 fw-semibold small text-nowrap">
          <ArrowLeftRight className="text-primary" /> So sánh
        </div>
        <div className="d-flex gap-2 flex-grow-1 overflow-auto">
          {slots.map((p, i) =>
            p ? (
              <div key={p._id} className="compare-slot" title={p.title}>
                <ProductImage src={p.featuredImage} alt={p.title} size={96} fit="contain" className="compare-slot-img" />
                <span className="compare-slot-title d-none d-lg-block">{p.title}</span>
                <button type="button" className="compare-slot-remove" aria-label={`Bỏ ${p.title}`} onClick={() => removeCompare(p._id)}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Link key={`empty-${i}`} to="/products" className="compare-slot compare-slot-empty" aria-label="Thêm sản phẩm để so sánh">
                <PlusLg />
              </Link>
            )
          )}
        </div>
        <div className="d-flex flex-column flex-md-row gap-1 gap-md-2">
          <Button as={Link} to="/compare" size="sm" disabled={list.length < 2} className="text-nowrap fw-semibold">
            So sánh ngay ({list.length})
          </Button>
          <Button size="sm" variant="link" className="text-muted text-nowrap p-0 px-md-2" onClick={clearCompare}>
            Xóa tất cả
          </Button>
        </div>
      </div>
    </div>
  );
}
