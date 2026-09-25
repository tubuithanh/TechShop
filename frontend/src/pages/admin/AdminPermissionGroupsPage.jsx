import { useEffect, useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge } from 'react-bootstrap';
import { permissionGroupService } from '../../services/permissionGroupService';

const emptyForm = { name: '', description: '', permissions: [] };

export default function AdminPermissionGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const load = () => permissionGroupService.getAll().then(setGroups);

  useEffect(() => {
    load();
    permissionGroupService.getCatalog().then(setCatalog);
  }, []);

  const togglePermission = (key) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key]
    }));
  };

  const handleEdit = (g) => {
    setForm({ name: g.name, description: g.description || '', permissions: g.permissions || [] });
    setEditingId(g._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await permissionGroupService.update(editingId, form);
      } else {
        await permissionGroupService.create(form);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Lưu nhóm quyền thất bại');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa nhóm quyền này? Chỉ xóa được nếu không còn nhân viên nào thuộc nhóm.')) return;
    try {
      await permissionGroupService.remove(id);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xóa nhóm quyền');
    }
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Nhóm quyền (Phân quyền nhân viên)</h1>
          <p className="small text-muted mb-0">
            Admin luôn có toàn quyền. Nhóm quyền chỉ áp dụng cho tài khoản staff - gán 1 staff vào 1 hoặc nhiều
            nhóm ở trang "Quản lý nhân viên" để cấp đúng những quyền thao tác cần thiết.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }}
        >
          + Tạo nhóm quyền
        </Button>
      </div>

      <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingId ? 'Sửa nhóm quyền' : 'Tạo nhóm quyền'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Tên nhóm quyền</Form.Label>
                  <Form.Control
                    required
                    placeholder="VD: Nhân viên kho"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Mô tả</Form.Label>
                  <Form.Control
                    placeholder="Mô tả ngắn về nhóm quyền này"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Label>Quyền được cấp</Form.Label>
                <div className="border rounded-3 p-3 d-flex flex-column gap-2">
                  {catalog.map((p) => (
                    <Form.Check
                      key={p.key}
                      type="checkbox"
                      id={`perm-${p.key}`}
                      label={p.label}
                      checked={form.permissions.includes(p.key)}
                      onChange={() => togglePermission(p.key)}
                    />
                  ))}
                  {catalog.length === 0 && <div className="small text-muted">Đang tải danh mục quyền...</div>}
                </div>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="success">
              {editingId ? 'Lưu thay đổi' : 'Tạo nhóm quyền'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <div className="bg-white rounded-3 shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Tên nhóm</th>
              <th>Mô tả</th>
              <th>Quyền</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g._id}>
                <td className="fw-medium">{g.name}</td>
                <td className="small text-muted">{g.description}</td>
                <td>
                  <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 360 }}>
                    {(g.permissions || []).map((p) => (
                      <Badge key={p} bg="secondary" className="fw-normal">
                        {catalog.find((c) => c.key === p)?.label || p}
                      </Badge>
                    ))}
                    {(!g.permissions || g.permissions.length === 0) && (
                      <span className="small text-muted">Chưa có quyền nào</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-primary" onClick={() => handleEdit(g)}>
                      Sửa
                    </Button>
                    <Button size="sm" variant="outline-danger" onClick={() => handleDelete(g._id)}>
                      Xóa
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted">
                  Chưa có nhóm quyền nào
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Container>
  );
}
