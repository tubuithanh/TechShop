import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Row, Col, Breadcrumb, Badge, Form, Button, Spinner } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';
import { postService } from '../services/postService';
import ProductCard from '../components/ProductCard';

const categoryLabel = { tu_van: 'Tư vấn', danh_gia: 'Đánh giá', thu_thuat: 'Thủ thuật', tin_tuc: 'Tin tức' };

export default function PostDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    postService.getPostBySlug(slug).then(setPost);
  }, [slug]);

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const newComment = await postService.addComment(post._id, comment);
    setPost({ ...post, comments: [...(post.comments || []), newComment] });
    setComment('');
  };

  if (!post)
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );

  return (
    <Container fluid="xl" style={{ maxWidth: '48rem' }} className="py-4">
      <Breadcrumb className="mb-4" style={{ fontSize: '0.75rem' }}>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '/tin-tuc' }}>
          Tin tức & Cẩm nang
        </Breadcrumb.Item>
        <Breadcrumb.Item active>{categoryLabel[post.category]}</Breadcrumb.Item>
      </Breadcrumb>

      <Badge bg="primary" className="bg-opacity-10 text-primary fw-normal">
        {categoryLabel[post.category]}
      </Badge>
      <h1 className="fs-2 fw-bold mt-2 mb-2">{post.title}</h1>
      <div className="small text-muted mb-4">
        {post.nameAuthor} · {new Date(post.createdAt).toLocaleDateString('vi-VN')} · {post.viewCount} lượt xem
      </div>

      {post.featuredImage && <img src={post.featuredImage} alt={post.title} className="w-100 rounded-3 mb-4" />}

      <div className="small" style={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}>
        {post.content}
      </div>

      {post.relatedProductIds?.length > 0 && (
        <div className="mt-5">
          <h3 className="fw-bold mb-3">Sản phẩm liên quan trong bài viết</h3>
          <Row className="g-3">
            {post.relatedProductIds.map((p) => (
              <Col key={p._id} xs={6} md={4}>
                <ProductCard product={p} />
              </Col>
            ))}
          </Row>
        </div>
      )}

      <div className="mt-5 border-top pt-4">
        <h3 className="fw-bold mb-3">Bình luận ({post.comments?.length || 0})</h3>
        {user ? (
          <Form onSubmit={handleComment} className="d-flex gap-2 mb-4">
            <Form.Control
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Viết bình luận..."
            />
            <Button type="submit" variant="primary">
              Gửi
            </Button>
          </Form>
        ) : (
          <p className="small text-muted mb-4">Đăng nhập để bình luận.</p>
        )}
        <div className="d-flex flex-column gap-3">
          {(post.comments || []).map((c) => (
            <div key={c._id} className="border-bottom pb-2">
              <div className="small fw-medium">{c.displayName}</div>
              <div className="small">{c.message}</div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
