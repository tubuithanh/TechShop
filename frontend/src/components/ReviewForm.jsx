import { useEffect, useState } from 'react';
import { Form, Button, Spinner } from 'react-bootstrap';
import { StarFill, Star, XLg, Camera } from 'react-bootstrap-icons';
import { uploadService } from '../services/uploadService';
import { productService } from '../services/productService';

const RATING_TEXT = ['', 'Tệ', 'Không hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];

function StarInput({ value, onChange, size = 22, label }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="d-inline-flex align-items-center gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sao`}
          className="btn btn-link p-0 text-warning lh-1" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>
          {n <= shown ? <StarFill size={size} /> : <Star size={size} />}
        </button>
      ))}
    </span>
  );
}

// Form đánh giá sau khi nhận hàng (viết mới / sửa): điểm tổng thể, điểm từng tiêu chí, nhận xét nhanh, nội dung,
// ảnh, ẩn danh. Danh sách tiêu chí / thẻ lấy từ máy chủ (backend/utils/reviewCriteria.js).
// onSubmit({ rating, criteria, tags, message, images, isAnonymous }) trả về Promise; lỗi API hiện ngay dưới form.
export default function ReviewForm({ initial, submitLabel = 'Gửi đánh giá', onSubmit, onCancel }) {
  const [options, setOptions] = useState(null);
  const [values, setValues] = useState({
    rating: initial?.rating || 5,
    criteria: { ...(initial?.criteria || {}) },
    tags: initial?.tags || [],
    message: initial?.message || '',
    images: initial?.images || [],
    isAnonymous: initial?.isAnonymous || false
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const maxImages = options?.maxImages || 5;
  const maxTags = options?.maxTags || 6;

  useEffect(() => { productService.getReviewOptions().then(setOptions).catch(() => setOptions({ criteria: [], tags: { positive: [], negative: [] } })); }, []);

  const set = (patch) => setValues((v) => ({ ...v, ...patch }));
  const toggleTag = (t) => set({ tags: values.tags.includes(t) ? values.tags.filter((x) => x !== t) : values.tags.length >= maxTags ? values.tags : [...values.tags, t] });

  const handlePhotos = async (e) => {
    const files = [...e.target.files].slice(0, maxImages - values.images.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true); setError('');
    try {
      const urls = await uploadService.uploadImages(files);
      setValues((prev) => ({ ...prev, images: [...prev.images, ...urls].slice(0, maxImages) }));
    } catch (err) {
      setError(err.response?.data?.message || 'Tải ảnh thất bại');
    } finally { setUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try { await onSubmit(values); } catch (err) { setError(err.response?.data?.message || 'Lưu đánh giá thất bại'); } finally { setSaving(false); }
  };

  return (
    <Form onSubmit={handleSubmit} className="border rounded-3 p-3 p-md-4 bg-body" style={{ maxWidth: '40rem' }}>
      {/* Điểm tổng thể */}
      <div className="d-flex align-items-center flex-wrap gap-3 mb-3">
        <span className="fw-semibold">Đánh giá chung</span>
        <StarInput value={values.rating} onChange={(n) => set({ rating: n })} size={28} label="Đánh giá chung" />
        <span className="fw-medium text-warning-emphasis">{RATING_TEXT[values.rating]}</span>
      </div>

      {/* Điểm từng tiêu chí */}
      {options?.criteria?.length > 0 && (
        <div className="review-criteria-grid mb-3">
          {options.criteria.map((c) => (
            <div key={c.key} className="d-flex align-items-center justify-content-between gap-2">
              <span className="small text-muted">{c.label}</span>
              <span className="d-inline-flex align-items-center gap-2">
                <StarInput value={values.criteria[c.key] || 0} onChange={(n) => set({ criteria: { ...values.criteria, [c.key]: n } })} size={16} label={c.label} />
                {values.criteria[c.key] ? (
                  <button type="button" className="btn btn-link btn-sm p-0 text-muted" aria-label={`Bỏ chấm ${c.label}`} onClick={() => { const next = { ...values.criteria }; delete next[c.key]; set({ criteria: next }); }}><XLg size={10} /></button>
                ) : <span style={{ width: 10 }} />}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nhận xét nhanh */}
      {options && (options.tags.positive.length > 0 || options.tags.negative.length > 0) && (
        <div className="mb-3">
          <div className="small fw-medium mb-1">Nhận xét nhanh <span className="text-muted fw-normal">(chọn tối đa {maxTags})</span></div>
          <div className="d-flex flex-wrap gap-2">
            {[...options.tags.positive.map((t) => [t, false]), ...options.tags.negative.map((t) => [t, true])].map(([t, negative]) => {
              const on = values.tags.includes(t);
              return (
                <button key={t} type="button" onClick={() => toggleTag(t)} aria-pressed={on}
                  className={`btn btn-sm rounded-pill ${on ? (negative ? 'btn-danger' : 'btn-primary') : (negative ? 'btn-outline-danger' : 'btn-outline-secondary')}`}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Form.Control as="textarea" value={values.message} maxLength={2000} rows={4} className="mb-1"
        onChange={(e) => set({ message: e.target.value })}
        placeholder="Chia sẻ trải nghiệm thực tế: chất lượng, hiệu năng, pin, đóng gói, giao hàng..." />
      <div className="small text-muted text-end mb-2">{values.message.length}/2000</div>

      {/* Ảnh */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {values.images.map((img) => (
          <div key={img} className="position-relative">
            <img src={img} alt="Ảnh đính kèm" className="rounded border" style={{ width: '4.5rem', height: '4.5rem', objectFit: 'cover' }} />
            <button type="button" aria-label="Bỏ ảnh" className="btn btn-sm btn-dark position-absolute top-0 end-0 p-0 lh-1 rounded-circle" style={{ width: 20, height: 20 }}
              onClick={() => set({ images: values.images.filter((x) => x !== img) })}><XLg size={10} /></button>
          </div>
        ))}
        {values.images.length < maxImages && (
          <label className="d-inline-flex flex-column align-items-center justify-content-center border rounded text-muted small" style={{ width: '4.5rem', height: '4.5rem', cursor: 'pointer', borderStyle: 'dashed' }}>
            {uploading ? <Spinner size="sm" /> : <><Camera size={18} /><span style={{ fontSize: '0.7rem' }}>{values.images.length}/{maxImages}</span></>}
            <input type="file" accept="image/*" multiple hidden onChange={handlePhotos} disabled={uploading} />
          </label>
        )}
      </div>

      <Form.Check type="switch" id={`anon-${initial?._id || 'new'}`} className="mb-3 small" checked={values.isAnonymous}
        onChange={(e) => set({ isAnonymous: e.target.checked })} label="Đánh giá ẩn danh (tên hiển thị dạng N***n)" />

      {error && <div className="small text-danger mb-2">{error}</div>}
      <div className="d-flex gap-2">
        <Button type="submit" disabled={saving || uploading}>{saving ? 'Đang lưu...' : submitLabel}</Button>
        {onCancel && <Button variant="outline-secondary" onClick={onCancel} disabled={saving}>Hủy</Button>}
      </div>
    </Form>
  );
}
