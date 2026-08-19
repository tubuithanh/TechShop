import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, Row, Col, Form, Spinner, Nav } from 'react-bootstrap';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');

  const keyword = searchParams.get('keyword') || '';
  const categoryId = searchParams.get('categoryId') || '';
  const brandId = searchParams.get('brandId') || '';

  useEffect(() => {
    productService.getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    productService
      .getProducts({ keyword, categoryId, brandId, sort, limit: 20 })
      .then((res) => {
        if (!ignore) setProducts(res.data);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [keyword, categoryId, brandId, sort]);

  const handleCategoryChange = (catId) => {
    const params = Object.fromEntries(searchParams.entries());
    if (catId) params.categoryId = catId;
    else delete params.categoryId;
    setSearchParams(params);
  };

  return (
    <Container fluid="xl" className="py-4">
      <Row className="g-4">
        <Col xs={12} md={3}>
          <h3 className="fw-bold mb-2 fs-6">Danh mục</h3>
          <Nav className="flex-column mb-4">
            <Nav.Item>
              <Nav.Link
                onClick={() => handleCategoryChange('')}
                active={!categoryId}
                className={`small ps-0 ${!categoryId ? 'text-primary fw-medium' : 'text-body'}`}
              >
                Tất cả
              </Nav.Link>
            </Nav.Item>
            {categories.map((c) => (
              <Nav.Item key={c._id}>
                <Nav.Link
                  onClick={() => handleCategoryChange(c._id)}
                  active={categoryId === c._id}
                  className={`small ps-0 ${categoryId === c._id ? 'text-primary fw-medium' : 'text-body'}`}
                >
                  {c.name}
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
        </Col>

        <Col xs={12} md={9}>
          <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
            <h2 className="fw-bold fs-5 mb-0">
              {keyword ? `Kết quả tìm kiếm: "${keyword}"` : 'Danh sách sản phẩm'} ({products.length})
            </h2>
            <Form.Select value={sort} onChange={(e) => setSort(e.target.value)} className="small w-auto">
              <option value="newest">Mới nhất</option>
              <option value="price_asc">Giá tăng dần</option>
              <option value="price_desc">Giá giảm dần</option>
              <option value="best_selling">Bán chạy</option>
              <option value="top_rated">Đánh giá cao</option>
            </Form.Select>
          </div>

          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-5 text-muted">Không tìm thấy sản phẩm phù hợp</div>
          ) : (
            <Row className="g-3">
              {products.map((p) => (
                <Col key={p._id} xs={6} md={4}>
                  <ProductCard product={p} />
                </Col>
              ))}
            </Row>
          )}
        </Col>
      </Row>
    </Container>
  );
}
