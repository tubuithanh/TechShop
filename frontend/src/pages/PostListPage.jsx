import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Nav, Spinner } from 'react-bootstrap';
import { postService } from '../services/postService';

const categoryLabel = { tu_van: 'Tư vấn', danh_gia: 'Đánh giá', thu_thuat: 'Thủ thuật', tin_tuc: 'Tin tức' };

export default function PostListPage() {
  const [posts, setPosts] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    postService
      .getPosts({ category: category || undefined })
      .then((data) => {
        if (!ignore) setPosts(data);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [category]);

  return (
    <Container fluid="xl" style={{ maxWidth: '64rem' }} className="py-4">
      <h1 className="fs-3 fw-bold mb-2">Tin tức & Cẩm nang công nghệ</h1>
      <p className="small text-muted mb-4">Cập nhật tin tức, thủ thuật và bài tư vấn chọn mua sản phẩm</p>

      <Nav variant="pills" className="gap-2 mb-4 flex-wrap">
        <Nav.Item>
          <Nav.Link onClick={() => setCategory('')} active={!category} className="small rounded-pill border">
            Tất cả
          </Nav.Link>
        </Nav.Item>
        {Object.entries(categoryLabel).map(([key, label]) => (
          <Nav.Item key={key}>
            <Nav.Link
              onClick={() => setCategory(key)}
              active={category === key}
              className="small rounded-pill border"
            >
              {label}
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : (
        <Row className="g-3">
          {posts.map((a) => (
            <Col key={a._id} xs={12} md={4}>
              <Card as={Link} to={`/tin-tuc/${a.slug}`} className="h-100 text-decoration-none text-body shadow-sm">
                {a.featuredImage && (
                  <Card.Img variant="top" src={a.featuredImage} alt={a.title} style={{ height: '9rem', objectFit: 'cover' }} />
                )}
                <Card.Body>
                  <span className="text-primary" style={{ fontSize: '0.75rem' }}>
                    {categoryLabel[a.category]}
                  </span>
                  <Card.Title as="h3" className="fw-medium fs-6 mt-1 line-clamp-2">
                    {a.title}
                  </Card.Title>
                  <p className="text-muted line-clamp-2" style={{ fontSize: '0.75rem' }}>
                    {a.shortDescription}
                  </p>
                  <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
                    {new Date(a.createdAt).toLocaleDateString('vi-VN')}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
          {posts.length === 0 && (
            <Col xs={12} className="text-muted text-center py-5">
              Chưa có bài viết nào
            </Col>
          )}
        </Row>
      )}
    </Container>
  );
}
