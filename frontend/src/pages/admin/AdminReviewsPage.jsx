import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, Card, Form, Button, InputGroup, Nav, Badge, Modal } from 'react-bootstrap';
import { PatchCheckFill } from 'react-bootstrap-icons';
import ReviewStatsPanel from '../../components/admin/ReviewStatsPanel';
import { reviewService } from '../../services/reviewService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminThumb from '../../components/admin/AdminThumb';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';
import AuditStamp from '../../components/admin/AuditStamp';

const CRITERIA_SHORT = { quality: 'Chất lượng', accuracy: 'Đúng mô tả', packaging: 'Đóng gói', delivery: 'Giao hàng', service: 'Phục vụ' };
// Thẻ chê - khớp TAGS.negative ở backend/utils/reviewCriteria.js
const NEGATIVE_TAGS = ['Giao hàng chậm', 'Đóng gói sơ sài', 'Không giống mô tả', 'Có lỗi / trầy xước', 'Thiếu phụ kiện'];

// 2 tab: Tổng quan (số liệu + biểu đồ) và Danh sách (đọc, lọc, phản hồi). Bấm vào số liệu -> mở danh sách đã lọc sẵn.
export default function AdminReviewsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' || ['rating', 'replied', 'negative', 'hasImages', 'productId', 'q'].some((k) => params.get(k)) ? 'list' : 'stats';
  const [zoom, setZoom] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;
  const query = useListQuery(['rating', 'replied', 'negative', 'hasImages', 'productId']);
  const { data: reviews, total, totalPages, loading, reload: load } = useAdminList(reviewService.getAllAdmin, {
    ...query.apiParams,
    limit: pageSize
  });
  const page = query.values.page;
  const setPage = query.setPage;
  const filters = [
    { key: 'rating', label: 'Số sao', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} sao` })) },
    { key: 'replied', label: 'Phản hồi', options: [{ value: 'false', label: 'Chưa phản hồi' }, { value: 'true', label: 'Đã phản hồi' }] },
    { key: 'negative', label: 'Khiếu nại', options: [{ value: 'true', label: 'Có thẻ chê' }] },
    { key: 'hasImages', label: 'Hình ảnh', options: [{ value: 'true', label: 'Có ảnh' }] },
    ...(query.values.productId ? [{ key: 'productId', label: 'Sản phẩm', options: [{ value: query.values.productId, label: reviews[0]?.productId?.title || 'đã chọn' }] }] : [])
  ];
  const setView = (v) => setParams(v === 'list' ? { view: 'list' } : {});
  // Từ biểu đồ / số liệu: mở danh sách với bộ lọc tương ứng
  const drill = (f) => setParams({ view: 'list', ...f });

  const handleReply = async (id) => {
    const content = replyDrafts[id];
    if (!content?.trim()) return;
    try {
      await reviewService.reply(id, content);
    } catch (err) {
      alert(err.response?.data?.message || 'Không gửi được trả lời');
      return;
    }
    setReplyDrafts({ ...replyDrafts, [id]: '' });
    load();
  };

  return (
    <Container fluid>
      <h1 className="fs-4 fw-bold mb-3">Đánh giá sản phẩm</h1>
      <Nav variant="tabs" activeKey={view} onSelect={setView} className="mb-3">
        <Nav.Item><Nav.Link eventKey="stats">Tổng quan & biểu đồ</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="list">Danh sách đánh giá</Nav.Link></Nav.Item>
      </Nav>
      {view === 'stats' ? <ReviewStatsPanel onDrill={drill} /> : (<>
      <AdminSearchBar query={query} placeholder="Tên khách, nội dung, tên sản phẩm..." filters={filters} total={total} loading={loading} />
      <div className="d-flex flex-column gap-3">
        {!loading && reviews.length === 0 && <div className="text-center text-muted py-5">Không tìm thấy đánh giá phù hợp</div>}
        {reviews.map((r) => (
          <Card key={r._id} className="shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start mb-1">
                <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
                  <AdminThumb src={r.productId?.featuredImage} alt={r.productId?.title} size={52} />
                  <div style={{ minWidth: 0 }}>
                    <div className="small fw-medium admin-list-title">{r.productId?.title}</div>
                    <div className="d-flex align-items-center gap-2 small">
                      <AdminThumb src={r.userId?.avatar} name={r.userId?.displayName || r.displayName} size={20} rounded />
                      <span>{r.userId?.displayName || r.displayName}</span>
                      {r.isAnonymous && <Badge bg="secondary" className="fw-normal">Ẩn danh</Badge>}
                      <span className="text-warning">
                        {'★'.repeat(r.rating)}
                        <span className="text-body-tertiary">{'★'.repeat(5 - r.rating)}</span>
                      </span>
                    </div>
                  </div>
                </div>

              </div>
              <div className="small text-muted mb-1">
                {new Date(r.createdAt).toLocaleString('vi-VN')}
                {r.variantLabel && <> · Phân loại: {r.variantLabel}</>}
                {r.orderId?.orderCode && <> · Đơn #{r.orderId.orderCode}</>}
                {r.orderId?.storeId?.name && <> · {r.orderId.storeId.name}</>}
                {r.isVerifiedPurchase && <PatchCheckFill className="text-success ms-1" title="Đã mua hàng" />}
              </div>
              {r.criteria && Object.keys(CRITERIA_SHORT).some((k) => r.criteria[k]) && (
                <div className="d-flex flex-wrap gap-3 small mb-1">
                  {Object.entries(CRITERIA_SHORT).filter(([k]) => r.criteria[k]).map(([k, l]) => (
                    <span key={k} className="text-muted">{l}: <b className={r.criteria[k] <= 2 ? 'text-danger' : 'text-body'}>{r.criteria[k]}★</b></span>
                  ))}
                </div>
              )}
              {r.tags?.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mb-1">
                  {r.tags.map((t) => <Badge key={t} bg={NEGATIVE_TAGS.includes(t) ? 'danger-subtle' : 'success-subtle'} text={NEGATIVE_TAGS.includes(t) ? 'danger-emphasis' : 'success-emphasis'} className="fw-normal">{t}</Badge>)}
                </div>
              )}
              <p className="small text-secondary mb-2">{r.message}</p>
              {r.images?.length > 0 && (
                <div className="d-flex flex-wrap gap-2 mb-2">
                  {r.images.map((img) => <img key={img} src={img} alt="Ảnh đánh giá" role="button" onClick={() => setZoom(img)} className="rounded border" style={{ width: 56, height: 56, objectFit: 'cover' }} />)}
                </div>
              )}

              {r.reply?.content && (
                <div className="bg-light rounded-3 p-2 small mb-2">
                  <span className="fw-medium text-primary">Đã phản hồi: </span>
                  {r.reply.content}
                </div>
              )}

              <InputGroup size="sm">
                <Form.Control
                  value={replyDrafts[r._id] || ''}
                  onChange={(e) => setReplyDrafts({ ...replyDrafts, [r._id]: e.target.value })}
                  placeholder="Phản hồi đánh giá này..."
                />
                <Button variant="outline-primary" onClick={() => handleReply(r._id)}>
                  Gửi phản hồi
                </Button>

              </InputGroup>
            <AuditStamp audit={r.audit} className="mt-2" /></Card.Body>
          </Card>
        ))}
        {reviews.length === 0 && <div className="small text-muted">Chưa có đánh giá nào</div>}
      </div>
      <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
      </>)}
      <Modal show={!!zoom} onHide={() => setZoom(null)} centered size="lg">
        <Modal.Body className="p-2"><img src={zoom || ''} alt="Ảnh đánh giá" className="w-100 rounded" onClick={() => setZoom(null)} /></Modal.Body>
      </Modal>
    </Container>
  );
}
