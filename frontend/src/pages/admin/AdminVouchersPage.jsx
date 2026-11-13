import { useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge, Alert } from 'react-bootstrap';
import { voucherService } from '../../services/voucherService';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';
import { useAuth } from '../../store/AuthContext';
import { useScopeOptions, MultiPicker, ScopeSummary, searchProducts, idsOf, labelsOf } from '../../components/admin/ScopePicker';
import AuditStamp from '../../components/admin/AuditStamp';

// Ô ngày (yyyy-mm-dd, giờ Việt Nam): bắt đầu = 00:00, hết hạn = 23:59:59 của ngày đã chọn. Trước đây gửi thẳng
// "yyyy-mm-dd" (= 00:00) làm mã hết hạn từ ĐẦU ngày hết hạn, sớm hơn 1 ngày so với ý người tạo.
const toDayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const toDayEnd = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);
const toInputDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyForm = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscountAmount: '',
  minOrderValue: 0,
  usageLimit: 0,
  perCustomerLimit: 1,
  startDate: '',
  endDate: '',
  categoryIds: [],
  productIds: [],
  storeIds: [],
  tierKeys: []
};

export default function AdminVouchersPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  // Nhân viên có quyền "xem khuyến mãi" chỉ xem; tạo / sửa / tắt chỉ admin (backend cũng chặn)
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const scopeOptions = useScopeOptions();
  const [productLabels, setProductLabels] = useState({});
  const query = useListQuery(['state']);
  const { q, state } = query.apiParams;
  const { data: vouchers, total, loading, reload: load } = useAdminList(voucherService.getAll, { q, state });
  const filters = [
    {
      key: 'state',
      label: 'Tình trạng',
      options: [
        { value: 'running', label: 'Đang diễn ra' },
        { value: 'upcoming', label: 'Sắp diễn ra' },
        { value: 'expired', label: 'Đã hết hạn' },
        { value: 'disabled', label: 'Đã vô hiệu hóa' }
      ]
    }
  ];

  const openForm = (v = null) => {
    setEditingId(v?._id || null);
    setFormError('');
    setForm(
      v
        ? { ...emptyForm, ...v, maxDiscountAmount: v.maxDiscountAmount ?? '', startDate: toInputDate(v.startDate), endDate: toInputDate(v.endDate),
            categoryIds: idsOf(v.categoryIds), productIds: idsOf(v.productIds), storeIds: idsOf(v.storeIds), tierKeys: v.tierKeys || [] }
        : emptyForm
    );
    setProductLabels(labelsOf(v?.productIds, 'title'));
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const payload = {
      code: form.code,
      description: form.description,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      maxDiscountAmount: form.discountType === 'percent' && form.maxDiscountAmount !== '' ? Number(form.maxDiscountAmount) : null,
      minOrderValue: Number(form.minOrderValue) || 0,
      usageLimit: Number(form.usageLimit) || 0,
      perCustomerLimit: Number(form.perCustomerLimit) || 0,
      startDate: toDayStart(form.startDate),
      endDate: toDayEnd(form.endDate),
      categoryIds: form.categoryIds,
      productIds: form.productIds,
      storeIds: form.storeIds,
      tierKeys: form.tierKeys
    };
    try {
      if (editingId) await voucherService.update(editingId, payload);
      else await voucherService.create(payload);
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Không lưu được voucher');
    }
  };

  const handleRemove = async (id) => {
    if (!confirm('Vô hiệu hóa voucher này?')) return;
    try {
      await voucherService.remove(id);
    } catch (err) {
      alert(err.response?.data?.message || 'Không vô hiệu hóa được');
    }
    load();
  };

  const handleEnable = async (v) => {
    try {
      await voucherService.update(v._id, { isActive: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Không bật lại được');
    }
    load();
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fs-4 fw-bold mb-0">Mã giảm giá (voucher)</h1>
        {canEdit && (
          <Button variant="primary" onClick={() => openForm()}>
            + Tạo voucher
          </Button>
        )}
      </div>

      <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? `Sửa voucher ${form.code}` : 'Tạo voucher'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {formError && <Alert variant="danger" className="small py-2">{formError}</Alert>}
            {editingId && form.usedCount > 0 && (
              <Alert variant="info" className="small py-2">Mã đã được dùng {form.usedCount} lượt nên không đổi được tên mã.</Alert>
            )}
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Mã voucher</Form.Label>
                  <Form.Control
                    required
                    placeholder="VD: SALE20"
                    disabled={Boolean(editingId && form.usedCount > 0)}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Loại giảm giá</Form.Label>
                  <Form.Select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                  >
                    <option value="percent">Giảm theo %</option>
                    <option value="fixed">Giảm số tiền cố định</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>
                    {form.discountType === 'percent' ? 'Phần trăm giảm (VD: 10)' : 'Số tiền giảm (VNĐ)'}
                  </Form.Label>
                  <Form.Control
                    required
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  />
                </Form.Group>
              </Col>
              {form.discountType === 'percent' && (
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Giảm tối đa (VNĐ)</Form.Label>
                    <Form.Control
                      type="number"
                      value={form.maxDiscountAmount}
                      onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              )}
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Giá trị đơn tối thiểu</Form.Label>
                  <Form.Control
                    type="number"
                    value={form.minOrderValue}
                    onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Giới hạn lượt dùng - toàn hệ thống (0 = không giới hạn)</Form.Label>
                  <Form.Control
                    type="number"
                    value={form.usageLimit}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Giới hạn lượt dùng / khách hàng (0 = không giới hạn)</Form.Label>
                  <Form.Control
                    type="number"
                    value={form.perCustomerLimit}
                    onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })}
                  />
                  <Form.Text className="text-muted">Mặc định 1 (mỗi khách chỉ dùng được 1 lần)</Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Ngày bắt đầu (trống = ngay bây giờ)</Form.Label>
                  <Form.Control type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Ngày hết hạn (dùng được hết ngày này)</Form.Label>
                  <Form.Control
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <div className="border rounded-3 p-3">
                  <div className="fw-medium mb-1">Phạm vi áp dụng</div>
                  <div className="small text-muted mb-3">
                    Để trống = không giới hạn. Nếu chọn danh mục / sản phẩm, mã chỉ giảm trên tiền của các sản phẩm đó.
                  </div>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Label className="small fw-medium">Danh mục sản phẩm</Form.Label>
                      <MultiPicker value={form.categoryIds} onChange={(v) => setForm({ ...form, categoryIds: v })} options={scopeOptions.categories} placeholder="Tìm danh mục..." />
                    </Col>
                    <Col md={6}>
                      <Form.Label className="small fw-medium">Sản phẩm cụ thể</Form.Label>
                      <MultiPicker value={form.productIds} onChange={(v) => setForm({ ...form, productIds: v })} search={searchProducts} labels={productLabels} placeholder="Gõ tên sản phẩm..." emptyText="Không tìm thấy sản phẩm" />
                    </Col>
                    <Col md={6}>
                      <Form.Label className="small fw-medium">Chi nhánh</Form.Label>
                      <MultiPicker value={form.storeIds} onChange={(v) => setForm({ ...form, storeIds: v })} options={scopeOptions.stores} placeholder="Tìm chi nhánh..." />
                    </Col>
                    <Col md={6}>
                      <Form.Label className="small fw-medium">Hạng thành viên</Form.Label>
                      <MultiPicker value={form.tierKeys} onChange={(v) => setForm({ ...form, tierKeys: v })} options={scopeOptions.tiers} placeholder="Tìm hạng..." />
                    </Col>
                  </Row>
                </div>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Mô tả</Form.Label>
                  <Form.Control
                    placeholder="Mô tả"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="success">
              {editingId ? 'Lưu thay đổi' : 'Tạo voucher'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <AdminSearchBar query={query} placeholder="Mã voucher, mô tả chương trình..." filters={filters} total={total} loading={loading} />
      <div className="bg-white rounded-3 shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Mã</th>
              <th>Mô tả</th>
              <th>Giảm giá</th>
              <th>Phạm vi</th>
              <th>Đã dùng</th>
              <th>Lượt/khách</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v._id}>
                <td className="fw-medium">{v.code}<AuditStamp audit={v.audit} /></td>
                <td>{v.description}</td>
                <td>
                  {v.discountType === 'percent' ? `${v.discountValue}%` : `${v.discountValue.toLocaleString()}đ`}
                </td>
                <td className="small" style={{ maxWidth: 220 }}><ScopeSummary v={v} tiers={scopeOptions.tiers} /></td>
                <td>
                  {v.usedCount} / {v.usageLimit || '∞'}
                </td>
                <td>{v.perCustomerLimit || '∞'}</td>
                <td className="small text-nowrap">
                  {new Date(v.startDate).toLocaleDateString('vi-VN')} – {new Date(v.endDate).toLocaleDateString('vi-VN')}
                </td>
                <td>
                  <Badge bg={v.isActive ? 'success' : 'secondary'}>{v.isActive ? 'Hoạt động' : 'Đã tắt'}</Badge>
                </td>
                <td className="text-nowrap">
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => openForm(v)}>
                        Sửa
                      </Button>
                      {v.isActive ? (
                        <Button size="sm" variant="outline-danger" onClick={() => handleRemove(v._id)}>
                          Vô hiệu hóa
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline-success" onClick={() => handleEnable(v)}>
                          Bật lại
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && vouchers.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted p-4">
                  Không tìm thấy kết quả phù hợp
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Container>
  );
}
