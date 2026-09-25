import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, Row, Col, Form, Spinner, Nav, Button } from 'react-bootstrap';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';
import { useSettings } from '../store/SettingsContext';

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tổng số sản phẩm khớp bộ lọc (từ API) - không dùng products.length vì đó chỉ là số trên 1 trang
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const { settings } = useSettings();

  const keyword = searchParams.get('keyword') || '';
  const categoryId = searchParams.get('categoryId') || '';
  const brandId = searchParams.get('brandId') || '';

  // Bộ lọc theo thông số dạng số (RAM, pin, tần số quét...) - chỉ hiện khi đã chọn 1 danh mục, vì mỗi
  // danh mục có bộ trường và đơn vị riêng (VD: "Pin" của điện thoại là mAh, của laptop là Wh).
  const [specInputs, setSpecInputs] = useState({});
  const [appliedSpecFilters, setAppliedSpecFilters] = useState('');
  const selectedCategory = categories.find((c) => c._id === categoryId);
  const numericFields = (selectedCategory?.specTemplate || []).flatMap((g) => g.fields.filter((f) => f.numeric));

  useEffect(() => {
    setSpecInputs({});
    setAppliedSpecFilters('');
  }, [categoryId]);

  const setSpecInput = (key, bound, value) =>
    setSpecInputs((prev) => ({ ...prev, [key]: { ...prev[key], [bound]: value } }));

  const applySpecFilters = (e) => {
    e.preventDefault();
    const filters = Object.entries(specInputs)
      .map(([key, r]) => ({ key, min: r.min, max: r.max }))
      .filter((f) => f.min || f.max);
    setAppliedSpecFilters(filters.length ? JSON.stringify(filters) : '');
  };

  const clearSpecFilters = () => {
    setSpecInputs({});
    setAppliedSpecFilters('');
  };

  useEffect(() => {
    productService.getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    productService
      .getProducts({
        keyword,
        categoryId,
        brandId,
        sort,
        limit: settings.productsPerPage,
        ...(appliedSpecFilters ? { specFilters: appliedSpecFilters } : {})
      })
      .then((res) => {
        if (!ignore) {
          setProducts(res.data);
          setTotal(res.total ?? res.data.length);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [keyword, categoryId, brandId, sort, settings.productsPerPage, appliedSpecFilters]);

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

          {numericFields.length > 0 && (
            <Form onSubmit={applySpecFilters}>
              <h3 className="fw-bold mb-2 fs-6">Lọc theo thông số</h3>
              {numericFields.map((f) => (
                <Form.Group key={f.key} className="mb-2">
                  <Form.Label className="small mb-1">
                    {f.key} ({f.numeric.unit})
                  </Form.Label>
                  <div className="d-flex gap-1">
                    <Form.Control
                      size="sm"
                      type="number"
                      step="any"
                      placeholder="Từ"
                      value={specInputs[f.key]?.min || ''}
                      onChange={(e) => setSpecInput(f.key, 'min', e.target.value)}
                    />
                    <Form.Control
                      size="sm"
                      type="number"
                      step="any"
                      placeholder="Đến"
                      value={specInputs[f.key]?.max || ''}
                      onChange={(e) => setSpecInput(f.key, 'max', e.target.value)}
                    />
                  </div>
                </Form.Group>
              ))}
              <div className="d-flex gap-2 mt-2">
                <Button type="submit" size="sm" variant="primary">
                  Áp dụng
                </Button>
                <Button size="sm" variant="outline-secondary" onClick={clearSpecFilters}>
                  Xóa lọc
                </Button>
              </div>
            </Form>
          )}
        </Col>

        <Col xs={12} md={9}>
          <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
            <h2 className="fw-bold fs-5 mb-0">
              {keyword ? `Kết quả tìm kiếm: "${keyword}"` : 'Danh sách sản phẩm'} ({total})
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
