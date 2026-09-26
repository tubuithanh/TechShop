import { useState } from 'react';
import { Container, Card, Badge, Form, Button, InputGroup } from 'react-bootstrap';
import { reviewService } from '../../services/reviewService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';

export default function AdminReviewsPage() {
  const [replyDrafts, setReplyDrafts] = useState({});
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;
  const query = useListQuery(['status', 'rating', 'replied']);
  const { data: reviews, total, totalPages, loading, reload: load } = useAdminList(reviewService.getAllAdmin, {
    ...query.apiParams,
    limit: pageSize
  });
  const page = query.values.page;
  const setPage = query.setPage;
  const filters = [
    { key: 'status', label: 'Hiển thị', options: [{ value: 'visible', label: 'Đang hiển thị' }, { value: 'hidden', label: 'Đã ẩn' }] },
    { key: 'rating', label: 'Số sao', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} sao` })) },
    { key: 'replied', label: 'Phản hồi', options: [{ value: 'false', label: 'Chưa phản hồi' }, { value: 'true', label: 'Đã phản hồi' }] }
  ];

  const handleHide = async (id) => {
    if (!confirm('Ẩn đánh giá này khỏi trang sản phẩm?')) return;
    await reviewService.hide(id);
    load();
  };

  const handleReply = async (id) => {
    const content = replyDrafts[id];
    if (!content?.trim()) return;
    await reviewService.reply(id, content);
    setReplyDrafts({ ...replyDrafts, [id]: '' });
    load();
  };

  return (
    <Container fluid>
      <h1 className="fs-4 fw-bold mb-4">Quản lý đánh giá sản phẩm</h1>
      <AdminSearchBar query={query} placeholder="Tên khách, nội dung, tên sản phẩm..." filters={filters} total={total} loading={loading} />
      <div className="d-flex flex-column gap-3">
        {!loading && reviews.length === 0 && <div className="text-center text-muted py-5">Không tìm thấy đánh giá phù hợp</div>}
        {reviews.map((r) => (
          <Card key={r._id} className="shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start mb-1">
                <div>
                  <span className="fw-medium small">{r.userId?.displayName || r.displayName}</span>
                  <span className="text-warning small ms-2">{'★'.repeat(r.rating)}</span>
                  <span className="small text-muted ms-2">→ {r.productId?.title}</span>
                </div>
                <Badge bg={r.status === 'visible' ? 'success' : 'danger'}>
                  {r.status === 'visible' ? 'Đang hiển thị' : 'Đã ẩn'}
                </Badge>
              </div>
              <p className="small text-secondary mb-2">{r.message}</p>

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
                {r.status === 'visible' && (
                  <Button variant="outline-danger" onClick={() => handleHide(r._id)}>
                    Ẩn đánh giá
                  </Button>
                )}
              </InputGroup>
            </Card.Body>
          </Card>
        ))}
        {reviews.length === 0 && <div className="small text-muted">Chưa có đánh giá nào</div>}
      </div>
      <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </Container>
  );
}
