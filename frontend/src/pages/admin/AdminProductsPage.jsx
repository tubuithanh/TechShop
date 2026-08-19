import { useEffect, useState } from 'react';
import { Button, Card, Col, Form, Row, Table, Alert } from 'react-bootstrap';
import api from '../../services/api';
import { productService } from '../../services/productService';
import { placeholderImage } from '../../utils/placeholderImage';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

const emptyForm = {
  title: '',
  brandId: '',
  categoryId: '',
  price: '',
  salePrice: '',
  description: '',
  featuredImage: placeholderImage(400, 400, 'San pham'),
  imageURLs: []
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadProducts = () => productService.getProducts({ limit: 50 }).then((res) => setProducts(res.data));

  useEffect(() => {
    loadProducts();
    productService.getCategories().then(setCategories);
    productService.getBrands().then(setBrands);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price),
      salePrice: Number(form.salePrice) || undefined,
      imageURLs: [form.featuredImage]
    };
    if (editingId) {
      await api.put(`/products/${editingId}`, payload);
    } else {
      await api.post('/products', payload);
    }
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
    loadProducts();
  };

  const handleEdit = (p) => {
    setForm({
      title: p.title,
      brandId: p.brandId?._id || p.brandId || '',
      categoryId: p.categoryId?._id || p.categoryId || '',
      price: p.price,
      salePrice: p.salePrice || '',
      description: p.description || '',
      featuredImage: p.featuredImage,
      imageURLs: p.imageURLs || []
    });
    setEditingId(p._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa (ẩn) sản phẩm này khỏi cửa hàng?')) return;
    await api.delete(`/products/${id}`);
    loadProducts();
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fs-4 fw-bold mb-0">Quản lý sản phẩm</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(!showForm);
          }}
        >
          {showForm ? 'Đóng form' : '+ Thêm sản phẩm'}
        </Button>
      </div>

      {showForm && (
        <Card className="shadow-sm mb-4">
          <Card.Body>
            <Form onSubmit={handleSubmit}>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Control
                    required
                    placeholder="Tên sản phẩm"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Col>
                <Col md={6}>
                  <Form.Select
                    required
                    value={form.brandId}
                    onChange={(e) => setForm({ ...form, brandId: e.target.value })}
                  >
                    <option value="">-- Chọn thương hiệu --</option>
                    {brands.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Select
                    required
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Control
                    required
                    type="number"
                    placeholder="Giá gốc"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </Col>
                <Col md={6}>
                  <Form.Control
                    type="number"
                    placeholder="Giá khuyến mãi (tùy chọn)"
                    value={form.salePrice}
                    onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                  />
                </Col>
                <Col md={6}>
                  <Form.Control
                    placeholder="Link ảnh sản phẩm"
                    value={form.featuredImage}
                    onChange={(e) => setForm({ ...form, featuredImage: e.target.value })}
                  />
                </Col>
                <Col xs={12}>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Mô tả sản phẩm"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Col>
                <Col xs={12}>
                  <Button type="submit" variant="success" size="sm">
                    {editingId ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm'}
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card.Body>
        </Card>
      )}

      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Sản phẩm</th>
              <th className="p-3">Thương hiệu</th>
              <th className="p-3">Giá</th>
              <th className="p-3">Đã bán</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td className="p-3">{p.title}</td>
                <td className="p-3">{p.brandId?.name}</td>
                <td className="p-3">{formatVND(p.salePrice || p.price)}</td>
                <td className="p-3">{p.soldCount}</td>
                <td className="p-3 d-flex gap-2">
                  <Button variant="outline-primary" size="sm" onClick={() => handleEdit(p)}>
                    Sửa
                  </Button>
                  <Button variant="outline-danger" size="sm" onClick={() => handleDelete(p._id)}>
                    Xóa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Alert variant="warning" className="mt-4 small">
        💡 Tồn kho được quản lý riêng theo từng cửa hàng (mô hình multi-store). Vào mục
        <strong> "Quản lý tồn kho theo cửa hàng"</strong> để thiết lập số lượng cho từng chi nhánh sau khi tạo sản phẩm.
      </Alert>
    </div>
  );
}
