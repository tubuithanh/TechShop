import { useState } from 'react';
import { Button, Modal, Alert } from 'react-bootstrap';
import api from '../services/api';
import { productService } from '../services/productService';
import ReviewForm from './ReviewForm';

export default function OrderReviewButton({ order, item }) {
  const [show, setShow] = useState(false), [review, setReview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const productId = item.productId?._id || item.productId;
  const open = async () => {
    setBusy(true); setError('');
    try { const r = await api.get(`/products/${productId}/review-eligibility`); setReview(r.data.data.review); setShow(true); }
    catch(e) { setError(e.response?.data?.message || 'Không tải được đánh giá'); }
    finally { setBusy(false); }
  };
  return <div className="mt-2"><Button size="sm" variant="outline-primary" disabled={busy} onClick={open}>{busy ? 'Đang tải…' : review ? 'Sửa đánh giá' : 'Đánh giá sản phẩm'}</Button>
    {error && <div className="small text-danger">{error}</div>}
    <Modal show={show} onHide={() => setShow(false)}><Modal.Header closeButton><Modal.Title>Đánh giá {item.name}</Modal.Title></Modal.Header><Modal.Body>
      <Alert variant="light">Chia sẻ trải nghiệm sau khi nhận hàng. Đánh giá của bạn được hiển thị công khai.</Alert>
      <ReviewForm key={review?._id || 'new'} initial={review} submitLabel={review ? 'Lưu đánh giá' : 'Gửi đánh giá'} onSubmit={async values => {
        const saved = review ? await productService.updateReview(productId, review._id, values) : await productService.createReview(productId, { ...values, orderId: order._id });
        setReview(saved); setShow(false);
      }} />
    </Modal.Body></Modal>
  </div>;
}
