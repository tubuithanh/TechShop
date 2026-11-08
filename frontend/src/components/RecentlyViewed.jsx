import { Link } from 'react-router-dom';
import { ClockHistory } from 'react-bootstrap-icons';
import ProductImage from './ProductImage';
import { RECENT_KEY, useLocalList } from '../utils/localLists';

const vnd = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';

// Dải "Sản phẩm bạn đã xem" cuộn ngang. excludeId: bỏ sản phẩm đang xem khỏi danh sách.
export default function RecentlyViewed({ excludeId, className = '' }) {
  const list = useLocalList(RECENT_KEY).filter((p) => p._id !== excludeId);
  if (!list.length) return null;
  return (
    <section className={className}>
      <h2 className="fs-5 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <ClockHistory className="text-primary" /> Sản phẩm bạn đã xem
      </h2>
      <div className="recent-strip">
        {list.map((p) => (
          <Link key={p._id} to={`/products/${p.slug}`} className="recent-item text-decoration-none text-reset hover-lift">
            <ProductImage src={p.featuredImage} alt={p.title} size={160} fit="contain" className="recent-item-img" />
            <div className="p-2">
              <div className="small line-clamp-2" style={{ minHeight: '2.5em' }}>
                {p.title}
              </div>
              <div className="text-primary fw-bold small mt-1">{vnd(p.effectivePrice ?? (p.salePrice || p.price))}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
