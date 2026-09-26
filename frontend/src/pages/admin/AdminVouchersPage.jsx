import { useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge } from 'react-bootstrap';
import { voucherService } from '../../services/voucherService';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';

const emptyForm = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscountAmount: '',
  minOrderValue: 0,
  usageLimit: 0,
  perCustomerLimit: 1,
  endDate: ''
};

export default function AdminVouchersPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    await voucherService.create({
      ...form,
      discountValue: Number(form.discountValue),
      maxDiscountAmount: Number(form.maxDiscountAmount) || undefined,
      minOrderValue: Number(form.minOrderValue) || 0,
      usageLimit: Number(form.usageLimit) || 0,
      perCustomerLimit: Number(form.perCustomerLimit) || 0
    });
    setShowForm(false);
    setForm(emptyForm);
    load();
  };

  const handleRemove = async (id) => {
    if (!confirm('Vô hiệu hóa voucher này?')) return;
    await voucherService.remove(id);
    load();
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fs-4 fw-bold mb-0">Quản lý khuyến mãi / Voucher</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          + Tạo voucher
        </Button>
      </div>

      <Modal show={showForm} onHide={() => setShowForm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Tạo voucher</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Mã voucher</Form.Label>
                  <Form.Control
                    required
                    placeholder="VD: SALE20"
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
                  <Form.Label>Ngày hết hạn</Form.Label>
                  <Form.Control
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </Form.Group>
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
              Tạo voucher
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
              <th>Đã dùng</th>
              <th>Lượt/khách</th>
              <th>Hết hạn</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v._id}>
                <td className="fw-medium">{v.code}</td>
                <td>{v.description}</td>
                <td>
                  {v.discountType === 'percent' ? `${v.discountValue}%` : `${v.discountValue.toLocaleString()}đ`}
                </td>
                <td>
                  {v.usedCount} / {v.usageLimit || '∞'}
                </td>
                <td>{v.perCustomerLimit || '∞'}</td>
                <td>{new Date(v.endDate).toLocaleDateString('vi-VN')}</td>
                <td>
                  <Badge bg={v.isActive ? 'success' : 'secondary'}>{v.isActive ? 'Hoạt động' : 'Đã tắt'}</Badge>
                </td>
                <td>
                  <Button size="sm" variant="outline-danger" onClick={() => handleRemove(v._id)}>
                    Vô hiệu hóa
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && vouchers.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted p-4">
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
