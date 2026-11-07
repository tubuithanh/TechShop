import { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { uploadService } from '../services/uploadService';

const MAX_IMAGES = 3;

// Form đánh giá sản phẩm (chấm sao, nội dung, tối đa 3 ảnh) - dùng cho cả viết mới và sửa đánh giá.
// onSubmit({ rating, message, images }) trả về Promise; lỗi từ API được hiển thị ngay dưới form.
export default function ReviewForm({ initial, submitLabel = 'Gửi đánh giá', onSubmit, onCancel }) {
  const [values, setValues] = useState({
    rating: initial?.rating || 5,
    message: initial?.message || '',
    images: initial?.images || []
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handlePhotos = async (e) => {
    const files = [...e.target.files].slice(0, MAX_IMAGES - values.images.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const urls = await uploadService.uploadImages(files);
      setValues((prev) => ({ ...prev, images: [...prev.images, ...urls].slice(0, MAX_IMAGES) }));
    } catch (err) {
      setError(err.response?.data?.message || 'Tải ảnh thất bại');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.response?.data?.message || 'Lưu đánh giá thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="border rounded-3 p-3 p-md-4" style={{ maxWidth: '32rem' }}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="small">Chấm điểm:</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <Button
            type="button"
            variant="link"
            key={star}
            aria-label={`${star} sao`}
            onClick={() => setValues({ ...values, rating: star })}
            className={`p-0 text-decoration-none ${star <= values.rating ? 'text-warning' : 'text-secondary'}`}
          >
            ★
          </Button>
        ))}
      </div>
      <Form.Control
        as="textarea"
        value={values.message}
        maxLength={2000}
        onChange={(e) => setValues({ ...values, message: e.target.value })}
        placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..."
        className="small mb-2"
        rows={3}
      />
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        {values.images.map((img) => (
          <div key={img} className="position-relative">
            <img src={img} alt="Ảnh đính kèm" className="rounded border" style={{ width: '4rem', height: '4rem', objectFit: 'cover' }} />
            <button
              type="button"
              aria-label="Bỏ ảnh"
              className="btn btn-sm btn-light border position-absolute top-0 end-0 p-0 lh-1"
              style={{ width: '1.25rem', height: '1.25rem' }}
              onClick={() => setValues((prev) => ({ ...prev, images: prev.images.filter((u) => u !== img) }))}
            >
              ×
            </button>
          </div>
        ))}
        {values.images.length < MAX_IMAGES && (
          <Form.Label className="btn btn-outline-secondary btn-sm mb-0">
            {uploading ? 'Đang tải...' : `📷 Thêm ảnh (tối đa ${MAX_IMAGES})`}
            <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={handlePhotos} />
          </Form.Label>
        )}
      </div>
      {error && <div className="small text-danger mb-2">{error}</div>}
      <div className="d-flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={uploading || saving}>
          {saving ? 'Đang lưu...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline-secondary" size="sm" onClick={onCancel} disabled={saving}>
            Hủy
          </Button>
        )}
      </div>
    </Form>
  );
}
