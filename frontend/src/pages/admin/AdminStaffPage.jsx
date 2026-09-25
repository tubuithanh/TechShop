import { useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge } from 'react-bootstrap';
import { staffService } from '../../services/staffService';
import { permissionGroupService } from '../../services/permissionGroupService';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';

const emptyForm = { name: '', email: '', password: '', role: 'staff', groupIds: [], storeId: '' };

export default function AdminStaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [groups, setGroups] = useState([]);
  const [stores, setStores] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const load = () => staffService.getAll().then(setStaff);

  useEffect(() => {
    load();
    permissionGroupService.getAll().then(setGroups);
    storeService.getStores().then(setStores);
  }, []);

  const toggleGroup = (id) => {
    setForm((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(id) ? prev.groupIds.filter((g) => g !== id) : [...prev.groupIds, id]
    }));
  };

  const handleCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (s) => {
    setForm({
      name: s.name,
      email: s.email,
      password: '',
      role: s.role,
      groupIds: (s.groupIds || []).map((g) => g._id || g),
      storeId: s.storeId?._id || s.storeId || ''
    });
    setEditingId(s._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          groupIds: form.groupIds,
          storeId: form.storeId || null
        };
        if (form.password) payload.newPassword = form.password;
        await staffService.update(editingId, payload);
      } else {
        await staffService.create({ ...form, storeId: form.storeId || null });
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lưu tài khoản thất bại');
    }
  };

  const handleToggleActive = async (s) => {
    const message = s.isActive
      ? `Khóa tài khoản "${s.name}"? Họ sẽ không thể đăng nhập cho tới khi được mở khóa lại.`
      : `Mở khóa tài khoản "${s.name}"?`;
    if (!confirm(message)) return;
    try {
      await staffService.update(s._id, { isActive: !s.isActive });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái tài khoản');
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Xóa vĩnh viễn tài khoản "${s.name}"?`)) return;
    try {
      await staffService.remove(s._id);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa tài khoản');
    }
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Quản lý nhân viên</h1>
          <p className="small text-muted mb-0">Tạo tài khoản admin/nhân viên và gán nhóm quyền cho từng người.</p>
        </div>
        <Button variant="primary" onClick={handleCreate}>
          + Tạo tài khoản
        </Button>
      </div>

      <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa tài khoản' : 'Tạo tài khoản mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Họ tên</Form.Label>
                  <Form.Control required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>{editingId ? 'Đặt lại mật khẩu (để trống nếu không đổi)' : 'Mật khẩu'}</Form.Label>
                  <Form.Control
                    required={!editingId}
                    type="password"
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Vai trò</Form.Label>
                  <Form.Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="staff">Nhân viên (staff) - theo nhóm quyền</option>
                    <option value="admin">Quản trị viên (admin) - toàn quyền</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              {form.role === 'staff' && (
                <Col md={12}>
                  <Form.Label>Chi nhánh phụ trách (tùy chọn - "Quản lý chi nhánh")</Form.Label>
                  <Form.Select
                    value={form.storeId}
                    onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                    className="mb-3"
                  >
                    <option value="">-- Không giới hạn chi nhánh (áp dụng theo nhóm quyền như bình thường) --</option>
                    {stores.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} — {s.city}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted d-block mb-3">
                    Nếu chọn 1 chi nhánh, nhân viên này chỉ được quản lý tồn kho của ĐÚNG chi nhánh đó, dù nhóm
                    quyền có cấp "Quản lý tồn kho" cho toàn hệ thống.
                  </Form.Text>
                </Col>
              )}
              {form.role === 'staff' && (
                <Col md={12}>
                  <Form.Label>Nhóm quyền</Form.Label>
                  <div className="border rounded-3 p-3 d-flex flex-column gap-2">
                    {groups.map((g) => (
                      <Form.Check
                        key={g._id}
                        type="checkbox"
                        id={`group-${g._id}`}
                        label={`${g.name}${g.description ? ` - ${g.description}` : ''}`}
                        checked={form.groupIds.includes(g._id)}
                        onChange={() => toggleGroup(g._id)}
                      />
                    ))}
                    {groups.length === 0 && (
                      <div className="small text-muted">Chưa có nhóm quyền nào - tạo ở trang "Nhóm quyền" trước.</div>
                    )}
                  </div>
                </Col>
              )}
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="success">
              {editingId ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <div className="bg-white rounded-3 shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Họ tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Nhóm quyền</th>
              <th>Chi nhánh</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s._id}>
                <td className="fw-medium">
                  {s.name}
                  {s._id === user?._id && <span className="small text-muted"> (bạn)</span>}
                </td>
                <td>{s.email}</td>
                <td>
                  <Badge bg={s.role === 'admin' ? 'dark' : 'info'}>{s.role === 'admin' ? 'Admin' : 'Staff'}</Badge>
                </td>
                <td>
                  {s.role === 'admin' ? (
                    <span className="small text-muted">Toàn quyền</span>
                  ) : (
                    <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 260 }}>
                      {(s.groupIds || []).map((g) => (
                        <Badge key={g._id || g} bg="secondary" className="fw-normal">
                          {g.name || '...'}
                        </Badge>
                      ))}
                      {(!s.groupIds || s.groupIds.length === 0) && (
                        <span className="small text-danger">Chưa gán nhóm - không có quyền nào</span>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  {s.storeId ? (
                    <Badge bg="warning" text="dark" className="fw-normal">
                      {s.storeId.name || '...'}
                    </Badge>
                  ) : (
                    <span className="small text-muted">Toàn hệ thống</span>
                  )}
                </td>
                <td>
                  <Badge bg={s.isActive ? 'success' : 'danger'}>{s.isActive ? 'Đang hoạt động' : 'Đã khóa'}</Badge>
                </td>
                <td>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-primary" onClick={() => handleEdit(s)}>
                      Sửa
                    </Button>
                    {s._id !== user?._id && (
                      <>
                        <Button size="sm" variant="outline-warning" onClick={() => handleToggleActive(s)}>
                          {s.isActive ? 'Khóa' : 'Mở khóa'}
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={() => handleDelete(s)}>
                          Xóa
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted">
                  Chưa có tài khoản nào
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Container>
  );
}
