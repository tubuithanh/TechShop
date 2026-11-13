import { useEffect, useState } from 'react';
import { Badge, Button, Form, ProgressBar, Spinner } from 'react-bootstrap';
import { StarFill, HandThumbsUp, HandThumbsUpFill, PatchCheckFill, Image as ImageIcon } from 'react-bootstrap-icons';
import { productService } from '../services/productService';
import { sizedImage } from '../utils/imageUrl';
import ReviewForm from './ReviewForm';

const Stars = ({ value, size = 12 }) => (
  <span className="text-warning d-inline-flex gap-0">
    {[1, 2, 3, 4, 5].map((i) => <StarFill key={i} size={size} className={i <= Math.round(value) ? '' : 'opacity-25'} />)}
  </span>
);
const SHORT = { quality: 'Chất lượng', accuracy: 'Đúng mô tả', packaging: 'Đóng gói', delivery: 'Giao hàng', service: 'Phục vụ' };

// Khu vực đánh giá trên trang sản phẩm (như sàn TMĐT): tổng quan nhiều tiêu chí, lọc theo sao / có ảnh, sắp xếp,
// từng đánh giá có điểm tiêu chí, nhận xét nhanh, phân loại đã mua, nút "Hữu ích", phản hồi của cửa hàng.
// refreshKey đổi (khách vừa viết / sửa đánh giá) -> tải lại.
export default function ProductReviews({ product, isCustomer, user, myReview, eligibility, onCreate, onUpdate, editingId, setEditingId, onZoom, refreshKey }) {
  const [filter, setFilter] = useState({ star: '', withImages: false, sort: 'newest' });
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [helped, setHelped] = useState({}); // reviewId -> true (khách đang đăng nhập đã bấm)

  useEffect(() => {
    let live = true;
    setLoading(true);
    productService.getReviewPage(product._id, { star: filter.star || undefined, withImages: filter.withImages || undefined, sort: filter.sort })
      .then((r) => { if (live) setRes(r); })
      .catch(() => { if (live) setRes({ data: [], summary: null }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [product._id, filter, refreshKey]);

  const vote = async (r) => {
    try {
      const out = await productService.toggleReviewHelpful(product._id, r._id);
      setHelped((h) => ({ ...h, [r._id]: out.helped }));
      setRes((cur) => ({ ...cur, data: cur.data.map((x) => (x._id === r._id ? { ...x, helpfulCount: out.helpfulCount } : x)) }));
    } catch (err) {
      alert(err.response?.data?.message || 'Không bình chọn được');
    }
  };

  const s = res?.summary;
  const chip = (key, label, active, onClick) => (
    <button key={key} type="button" onClick={onClick} className={`btn btn-sm rounded-pill ${active ? 'btn-primary' : 'btn-outline-secondary'}`}>{label}</button>
  );
  const ownerId = (r) => r.userId?._id || r.userId;

  return (
    <div>
      {/* Tổng quan */}
      {s && s.count > 0 && (
        <div className="review-summary mb-4">
          <div className="review-summary-score">
            <div className="display-6 fw-bold lh-1">{s.average}<span className="fs-6 text-muted">/5</span></div>
            <Stars value={s.average} size={16} />
            <div className="small text-muted mt-1">{s.count} đánh giá</div>
          </div>
          <div className="review-summary-stars">
            {[5, 4, 3, 2, 1].map((star) => (
              <button key={star} type="button" className="btn btn-link p-0 text-decoration-none text-reset d-flex align-items-center gap-2 small w-100"
                onClick={() => setFilter((f) => ({ ...f, star: f.star === star ? '' : star }))}>
                <span className="text-nowrap" style={{ width: 28 }}>{star} <StarFill className="text-warning" size={10} /></span>
                <ProgressBar now={s.count ? (s.stars[star] / s.count) * 100 : 0} variant="warning" className="flex-grow-1" style={{ height: 8 }} />
                <span className="text-muted text-end" style={{ width: 28 }}>{s.stars[star]}</span>
              </button>
            ))}
          </div>
          {s.criteria.some((c) => c.average) && (
            <div className="review-summary-criteria">
              {s.criteria.filter((c) => c.average).map((c) => (
                <div key={c.key} className="d-flex align-items-center justify-content-between gap-2 small">
                  <span className="text-muted">{c.label}</span>
                  <span className="d-inline-flex align-items-center gap-1"><Stars value={c.average} size={11} /><b>{c.average}</b></span>
                </div>
              ))}
            </div>
          )}
          {s.tags.length > 0 && (
            <div className="review-summary-tags d-flex flex-wrap gap-1">
              {s.tags.map((t) => (
                <Badge key={t.tag} bg={t.negative ? 'danger-subtle' : 'success-subtle'} text={t.negative ? 'danger-emphasis' : 'success-emphasis'} className="fw-normal">
                  {t.tag} ({t.count})
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Viết đánh giá */}
      {isCustomer && !myReview && eligibility?.eligible && (
        <div className="mb-4">
          <div className="fw-semibold mb-2">Viết đánh giá của bạn</div>
          <ReviewForm onSubmit={onCreate} />
        </div>
      )}
      {isCustomer && !myReview && !eligibility?.eligible && (
        <p className="small text-muted">{eligibility ? 'Bạn có thể đánh giá sau khi nhận được sản phẩm trong đơn hàng đã giao thành công.' : 'Đang kiểm tra đơn hàng...'}</p>
      )}

      {/* Lọc & sắp xếp */}
      {s && s.count > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {chip('all', `Tất cả (${s.count})`, !filter.star && !filter.withImages, () => setFilter((f) => ({ ...f, star: '', withImages: false })))}
          {[5, 4, 3, 2, 1].map((n) => chip(n, `${n} sao (${s.stars[n]})`, filter.star === n, () => setFilter((f) => ({ ...f, star: f.star === n ? '' : n }))))}
          {s.withImages > 0 && chip('img', <><ImageIcon size={12} className="me-1" />Có hình ảnh ({s.withImages})</>, filter.withImages, () => setFilter((f) => ({ ...f, withImages: !f.withImages })))}
          <Form.Select size="sm" className="ms-auto" style={{ width: 'auto' }} value={filter.sort} aria-label="Sắp xếp đánh giá" onChange={(e) => setFilter((f) => ({ ...f, sort: e.target.value }))}>
            <option value="newest">Mới nhất</option>
            <option value="helpful">Hữu ích nhất</option>
            <option value="highest">Điểm cao nhất</option>
            <option value="lowest">Điểm thấp nhất</option>
          </Form.Select>
        </div>
      )}

      {/* Danh sách */}
      <div className="d-flex flex-column gap-4">
        {loading && !res && <Spinner size="sm" />}
        {res?.data.map((r) => (editingId === r._id ? (
          <div key={r._id} className="border-bottom pb-3">
            <div className="small fw-medium mb-2">Sửa đánh giá của bạn</div>
            <ReviewForm initial={r} submitLabel="Lưu thay đổi" onSubmit={onUpdate} onCancel={() => setEditingId(null)} />
          </div>
        ) : (
          <div key={r._id} className="border-bottom pb-3">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="fw-medium small">{r.displayName || r.userId?.displayName || 'Khách hàng'}</span>
              <Stars value={r.rating} />
              {r.isVerifiedPurchase && <Badge bg="success-subtle" text="success-emphasis" className="fw-normal d-inline-flex align-items-center gap-1"><PatchCheckFill size={10} /> Đã mua hàng</Badge>}
              {r.editedAt && <span className="text-muted" style={{ fontSize: '0.75rem' }}>(đã chỉnh sửa)</span>}
              {user && myReview?._id === r._id && (
                <Button variant="link" size="sm" className="p-0 ms-auto" onClick={() => setEditingId(r._id)}>✎ Sửa đánh giá</Button>
              )}
            </div>
            <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
              {new Date(r.createdAt).toLocaleDateString('vi-VN')}
              {r.variantLabel && <> · Phân loại: {r.variantLabel}</>}
            </div>
            {r.criteria && Object.keys(r.criteria).some((k) => r.criteria[k]) && (
              <div className="d-flex flex-wrap gap-3 mt-1" style={{ fontSize: '0.75rem' }}>
                {Object.entries(SHORT).filter(([k]) => r.criteria[k]).map(([k, label]) => (
                  <span key={k} className="text-muted">{label}: <b className="text-body">{r.criteria[k]}<StarFill size={9} className="text-warning ms-1" /></b></span>
                ))}
              </div>
            )}
            {r.tags?.length > 0 && (
              <div className="d-flex flex-wrap gap-1 mt-2">
                {r.tags.map((t) => <Badge key={t} bg="light" text="dark" className="fw-normal border">{t}</Badge>)}
              </div>
            )}
            {r.message && <p className="small mt-2 mb-2" style={{ whiteSpace: 'pre-line' }}>{r.message}</p>}
            {r.images?.length > 0 && (
              <div className="d-flex flex-wrap gap-2 mb-2">
                {r.images.map((img) => (
                  <img key={img} src={sizedImage(img, 160)} alt="Ảnh đánh giá" loading="lazy" role="button" onClick={() => onZoom?.(img)}
                    className="rounded border" style={{ width: '4.5rem', height: '4.5rem', objectFit: 'cover' }} />
                ))}
              </div>
            )}
            {r.reply?.content && (
              <div className="bg-light rounded p-2 mt-2" style={{ fontSize: '0.8rem' }}>
                <span className="fw-medium text-primary">Phản hồi từ TechShop: </span>{r.reply.content}
              </div>
            )}
            <div className="mt-2">
              {isCustomer && ownerId(r) !== user?._id ? (
                <Button variant="link" size="sm" className="p-0 text-decoration-none text-muted" onClick={() => vote(r)}>
                  {helped[r._id] ? <HandThumbsUpFill className="text-primary me-1" /> : <HandThumbsUp className="me-1" />}
                  Hữu ích{r.helpfulCount > 0 && ` (${r.helpfulCount})`}
                </Button>
              ) : r.helpfulCount > 0 && <span className="small text-muted"><HandThumbsUp className="me-1" />{r.helpfulCount} người thấy hữu ích</span>}
            </div>
          </div>
        )))}
        {res && res.data.length === 0 && <div className="small text-muted">{s?.count ? 'Không có đánh giá phù hợp bộ lọc' : 'Chưa có đánh giá nào'}</div>}
      </div>
    </div>
  );
}
