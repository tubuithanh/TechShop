import { useEffect, useState } from 'react';
import { Button, Card, Col, Form, Row, Table, Alert, Spinner, Badge } from 'react-bootstrap';
import api from '../../services/api';
import { productService } from '../../services/productService';
import { placeholderImage } from '../../utils/placeholderImage';
import { resizeImageToDataUrl } from '../../utils/imageUpload';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';

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
  imageURLs: [placeholderImage(400, 400, 'San pham')],
  coverIndex: 0
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { settings } = useSettings();
  const maxImages = settings.maxImagesPerProduct || 10;
  const pageSize = settings.productsPerPage || 20;

  const loadProducts = () =>
    productService
      .getProducts({ page, limit: pageSize, includeInactive: true })
      .then((res) => {
        setProducts(res.data);
        setTotalPages(res.totalPages || 1);
        setTotal(res.total || 0);
      });

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    productService.getCategories().then(setCategories);
    productService.getBrands().then(setBrands);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUrls = form.imageURLs.map((u) => u.trim()).filter(Boolean);
    if (cleanUrls.length === 0) {
      alert('Cần ít nhất 1 hình ảnh sản phẩm');
      return;
    }
    const coverIdx = Math.min(form.coverIndex, cleanUrls.length - 1);
    const payload = {
      title: form.title,
      brandId: form.brandId,
      categoryId: form.categoryId,
      price: Number(form.price),
      salePrice: Number(form.salePrice) || undefined,
      description: form.description,
      featuredImage: cleanUrls[coverIdx],
      imageURLs: cleanUrls
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
    const urls = p.imageURLs?.length ? p.imageURLs : [p.featuredImage].filter(Boolean);
    const coverIdx = urls.findIndex((u) => u === p.featuredImage);
    setForm({
      title: p.title,
      brandId: p.brandId?._id || p.brandId || '',
      categoryId: p.categoryId?._id || p.categoryId || '',
      price: p.price,
      salePrice: p.salePrice || '',
      description: p.description || '',
      imageURLs: urls.length ? urls : [placeholderImage(400, 400, 'San pham')],
      coverIndex: coverIdx === -1 ? 0 : coverIdx
    });
    setEditingId(p._id);
    setShowForm(true);
  };

  const updateImageUrl = (idx, value) => {
    const next = [...form.imageURLs];
    next[idx] = value;
    setForm({ ...form, imageURLs: next });
  };

  const addImageUrl = () => {
    if (form.imageURLs.length >= maxImages) return;
    setForm({ ...form, imageURLs: [...form.imageURLs, ''] });
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // cho phép chọn lại đúng file đó ở lần sau
    if (!files.length) return;
    const remainingSlots = maxImages - form.imageURLs.length;
    if (remainingSlots <= 0) {
      alert(`Sản phẩm chỉ được tối đa ${maxImages} ảnh (cấu hình tại Admin > Cấu hình hệ thống)`);
      return;
    }
    const filesToUpload = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      alert(`Chỉ còn ${remainingSlots} chỗ trống, ${files.length - remainingSlots} ảnh cuối sẽ không được tải lên`);
    }
    setUploading(true);
    try {
      const dataUrls = await Promise.all(filesToUpload.map((f) => resizeImageToDataUrl(f)));
      setForm((prev) => ({ ...prev, imageURLs: [...prev.imageURLs, ...dataUrls] }));
    } catch (err) {
      alert(err.message || 'Tải ảnh lên thất bại');
    } finally {
      setUploading(false);
    }
  };

  const removeImageUrl = (idx) => {
    const next = form.imageURLs.filter((_, i) => i !== idx);
    setForm({
      ...form,
      imageURLs: next.length ? next : [''],
      coverIndex: form.coverIndex >= next.length ? 0 : form.coverIndex
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa (ẩn) sản phẩm này khỏi cửa hàng?')) return;
    await api.delete(`/products/${id}`);
    loadProducts();
  };

  const handleRestore = async (id) => {
    await api.put(`/products/${id}`, { isActive: true });
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
                <Col xs={12}>
                  <Form.Label className="small fw-medium mb-2">
                    Hình ảnh sản phẩm ({form.imageURLs.length}/{maxImages}) — chọn nút tròn để đặt ảnh đại diện
                  </Form.Label>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <Form.Control
                      type="file"
                      accept="image/*"
                      multiple
                      size="sm"
                      disabled={uploading || form.imageURLs.length >= maxImages}
                      onChange={handleFileUpload}
                      style={{ maxWidth: 280 }}
                    />
                    {uploading && <Spinner animation="border" size="sm" />}
                    <span className="text-muted small">
                      {form.imageURLs.length >= maxImages
                        ? `Đã đạt giới hạn ${maxImages} ảnh/sản phẩm`
                        : 'Tải ảnh từ máy tính, hoặc dán link ở các ô bên dưới'}
                    </span>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {form.imageURLs.map((url, idx) => (
                      <div key={idx} className="d-flex align-items-center gap-2">
                        <Form.Check
                          type="radio"
                          name="coverImage"
                          checked={form.coverIndex === idx}
                          onChange={() => setForm({ ...form, coverIndex: idx })}
                          title="Đặt làm ảnh đại diện"
                        />
                        {url && (
                          <img
                            src={url}
                            alt={`Ảnh ${idx + 1}`}
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                          />
                        )}
                        <Form.Control
                          size="sm"
                          placeholder={`Link ảnh ${idx + 1}`}
                          value={url}
                          onChange={(e) => updateImageUrl(idx, e.target.value)}
                        />
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => removeImageUrl(idx)}
                          disabled={form.imageURLs.length === 1}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="mt-2"
                    onClick={addImageUrl}
                    disabled={form.imageURLs.length >= maxImages}
                  >
                    + Thêm ảnh
                  </Button>
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
              <th className="p-3">Trạng thái</th>
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
                <td className="p-3">
                  <Badge bg={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Đang bán' : 'Đã ẩn'}</Badge>
                </td>
                <td className="p-3 d-flex gap-2">
                  <Button variant="outline-primary" size="sm" onClick={() => handleEdit(p)}>
                    Sửa
                  </Button>
                  {p.isActive ? (
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(p._id)}>
                      Ẩn
                    </Button>
                  ) : (
                    <Button variant="outline-success" size="sm" onClick={() => handleRestore(p._id)}>
                      Khôi phục
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card.Body className="pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </Card.Body>
      </Card>

      <Alert variant="warning" className="mt-4 small">
        💡 Tồn kho được quản lý riêng theo từng cửa hàng (mô hình multi-store). Vào mục
        <strong> "Quản lý tồn kho theo cửa hàng"</strong> để thiết lập số lượng cho từng chi nhánh sau khi tạo sản phẩm.
      </Alert>
    </div>
  );
}
