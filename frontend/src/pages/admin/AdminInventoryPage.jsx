import { useEffect, useState } from 'react';
import { Container, Row, Col, Form, Button, Table, Badge } from 'react-bootstrap';
import { storeInventoryService } from '../../services/storeInventoryService';
import { storeService } from '../../services/storeService';
import { productService } from '../../services/productService';
import api from '../../services/api';
import { useSettings } from '../../store/SettingsContext';
import { useAuth } from '../../store/AuthContext';
import AdminPagination from '../../components/admin/AdminPagination';

export default function AdminInventoryPage() {
  const { user } = useAuth();
  // "Quản lý chi nhánh" (staff được gán storeId cụ thể) chỉ được thao tác đúng chi nhánh của mình -
  // khóa cứng ô chọn cửa hàng ở giao diện (backend cũng tự chặn nếu cố gọi API với storeId khác, đây
  // chỉ là lớp UX để họ không thấy 1 ô chọn có vẻ đổi được nhưng thực ra bị từ chối).
  const scopedStoreId = user?.storeId?._id || (typeof user?.storeId === 'string' ? user.storeId : null);

  const [inventories, setInventories] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(scopedStoreId || '');
  const [form, setForm] = useState({ productId: '', variantId: '', stock: 0, lowStockThreshold: 5 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;

  const loadInventories = (storeId) =>
    storeInventoryService.getInventories({ ...(storeId ? { storeId } : {}), page, limit: pageSize }).then((res) => {
      setInventories(res.data);
      setTotalPages(res.totalPages || 1);
      setTotal(res.total || 0);
    });

  useEffect(() => {
    storeService.getStores().then((data) => {
      setStores(data);
      if (!scopedStoreId && data.length > 0) setSelectedStoreId(data[0]._id);
    });
    // Danh sách chọn sản phẩm khi thiết lập tồn kho: giữ số lượng lớn hơn kích thước trang
    // thông thường vì đây là ô chọn (dropdown), không phải danh sách cần phân trang.
    productService.getProducts({ limit: 200 }).then((res) => setProducts(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStoreId) loadInventories(selectedStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, page, pageSize]);

  const handleStoreChange = (storeId) => {
    setSelectedStoreId(storeId);
    setPage(1);
  };

  const handleUpsert = async (e) => {
    e.preventDefault();
    try {
      await api.post('/store-inventories', { ...form, storeId: selectedStoreId, stock: Number(form.stock) });
      setForm({ productId: '', variantId: '', stock: 0, lowStockThreshold: 5 });
      loadInventories(selectedStoreId);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể lưu tồn kho');
    }
  };

  const handleQuickUpdate = async (id, newStock) => {
    try {
      await api.put(`/store-inventories/${id}`, { stock: Number(newStock) });
      loadInventories(selectedStoreId);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật tồn kho');
    }
  };

  return (
    <Container fluid>
      <h1 className="fs-4 fw-bold mb-2">Quản lý tồn kho theo cửa hàng</h1>
      <p className="small text-muted mb-4">
        Mô hình đa chi nhánh: mỗi cửa hàng quản lý tồn kho riêng cho từng sản phẩm.
      </p>

      {scopedStoreId ? (
        <div className="mb-4 small text-muted">
          Chi nhánh phụ trách: <strong>{stores.find((s) => s._id === scopedStoreId)?.name || '...'}</strong>{' '}
          <span className="fst-italic">(tài khoản của bạn chỉ quản lý được đúng chi nhánh này)</span>
        </div>
      ) : (
        <Form.Select
          value={selectedStoreId}
          onChange={(e) => handleStoreChange(e.target.value)}
          className="mb-4"
          style={{ maxWidth: 320 }}
        >
          {stores.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name} — {s.city}
            </option>
          ))}
        </Form.Select>
      )}

      <Form onSubmit={handleUpsert} className="bg-white rounded-3 p-3 shadow-sm mb-4">
        <Row className="g-3 align-items-end">
          <Col md={4}>
            <Form.Group>
              <Form.Label className="small text-muted">Sản phẩm</Form.Label>
              <Form.Select
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value, variantId: '' })}
              >
                <option value="">-- Chọn sản phẩm --</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label className="small text-muted">Phiên bản</Form.Label>
              <Form.Select
                required
                value={form.variantId}
                disabled={!form.productId}
                onChange={(e) => setForm({ ...form, variantId: e.target.value })}
              >
                <option value="">-- Chọn phiên bản --</option>
                {(products.find((p) => p._id === form.productId)?.variants || []).map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.label}
                    {v.isActive ? '' : ' (ngừng bán)'}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md="auto">
            <Form.Group>
              <Form.Label className="small text-muted">Số lượng tồn</Form.Label>
              <Form.Control
                required
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                style={{ width: 112 }}
              />
            </Form.Group>
          </Col>
          <Col md="auto">
            <Form.Group>
              <Form.Label className="small text-muted">Ngưỡng cảnh báo thấp</Form.Label>
              <Form.Control
                type="number"
                min={0}
                value={form.lowStockThreshold}
                onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                style={{ width: 112 }}
              />
            </Form.Group>
          </Col>
          <Col md="auto">
            <Button type="submit" variant="success">
              Thiết lập tồn kho
            </Button>
          </Col>
        </Row>
      </Form>

      <div className="bg-white rounded-3 shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Sản phẩm</th>
              <th>Tồn kho</th>
              <th>Ngưỡng cảnh báo</th>
              <th>Cập nhật lần cuối</th>
              <th>Thao tác nhanh</th>
            </tr>
          </thead>
          <tbody>
            {inventories.map((inv) => (
              <tr key={inv._id} className={inv.stock <= inv.lowStockThreshold ? 'table-danger' : ''}>
                <td>
                  {inv.productId?.title}
                  <div className="small text-muted">{inv.variantLabel}</div>
                </td>
                <td className="fw-medium">
                  {inv.stock}
                  {inv.stock <= inv.lowStockThreshold && (
                    <Badge bg="danger" className="ms-2">
                      ⚠ Sắp hết
                    </Badge>
                  )}
                </td>
                <td>{inv.lowStockThreshold}</td>
                <td className="small text-muted">{new Date(inv.lastUpdated).toLocaleString('vi-VN')}</td>
                <td>
                  <div className="d-flex gap-1">
                    <Button size="sm" variant="outline-secondary" onClick={() => handleQuickUpdate(inv._id, inv.stock + 10)}>
                      +10
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => handleQuickUpdate(inv._id, Math.max(0, inv.stock - 10))}
                    >
                      -10
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {inventories.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted">
                  Chưa có dữ liệu tồn kho cho cửa hàng này
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        <div className="p-3 pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </div>
      </div>
    </Container>
  );
}
