import { useEffect, useState } from 'react';
import { Card, Row, Col, Spinner } from 'react-bootstrap';
import { userService } from '../../services/userService';
import ProductCard from '../../components/ProductCard';

export default function WishlistPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userService.getWishlist().then(setProducts).finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-center py-4">
        <Spinner animation="border" />
      </div>
    );

  return (
    <Card>
      <Card.Body>
        <h2 className="fw-bold fs-5 mb-4">Sản phẩm yêu thích ({products.length})</h2>
        {products.length === 0 ? (
          <div className="small text-muted">
            Bạn chưa yêu thích sản phẩm nào. Bấm ♡ trên trang sản phẩm để lưu lại.
          </div>
        ) : (
          <Row xs={2} md={3} className="g-4">
            {products.map((p) => (
              <Col key={p._id}>
                <ProductCard product={p} />
              </Col>
            ))}
          </Row>
        )}
      </Card.Body>
    </Card>
  );
}
