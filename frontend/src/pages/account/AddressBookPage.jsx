import { useState } from 'react';
import { Card, Button, Form, Stack } from 'react-bootstrap';
import { useAuth } from '../../store/AuthContext';
import { userService } from '../../services/userService';

const emptyForm = { addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', orderNote: '' };

export default function AddressBookPage() {
  const { user, setUser } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const refreshUser = (addresses) => {
    setUser({ ...user, addresses });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let addresses;
    if (editingId) {
      addresses = await userService.updateAddress(editingId, form);
    } else {
      addresses = await userService.addAddress(form);
    }
    refreshUser(addresses);
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleEdit = (addr) => {
    setForm(addr);
    setEditingId(addr._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa địa chỉ này?')) return;
    const addresses = await userService.deleteAddress(id);
    refreshUser(addresses);
  };

  return (
    <Card>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="fw-bold fs-5 mb-0">Sổ địa chỉ</h2>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setForm(emptyForm);
              setEditingId(null);
              setShowForm(!showForm);
            }}
          >
            {showForm ? 'Đóng' : '+ Thêm địa chỉ'}
          </Button>
        </div>

        {showForm && (
          <Form onSubmit={handleSubmit} className="border rounded p-3 mb-4" style={{ maxWidth: '28rem' }}>
            <Form.Control
              required
              placeholder="Địa chỉ (số nhà, đường)"
              value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              className="mb-2"
              size="sm"
            />
            <Form.Control
              placeholder="Phường/Xã, Quận/Huyện"
              value={form.addressLine2}
              onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
              className="mb-2"
              size="sm"
            />
            <Form.Control
              placeholder="Tỉnh/Thành phố"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="mb-2"
              size="sm"
            />
            <Form.Control
              placeholder="Ghi chú giao hàng (tùy chọn)"
              value={form.orderNote}
              onChange={(e) => setForm({ ...form, orderNote: e.target.value })}
              className="mb-2"
              size="sm"
            />
            <Button type="submit" variant="dark" size="sm">
              {editingId ? 'Cập nhật' : 'Lưu địa chỉ'}
            </Button>
          </Form>
        )}

        <Stack gap={3}>
          {(user?.addresses || []).map((addr) => (
            <Card key={addr._id} body className="small">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <div>{addr.addressLine1}</div>
                  <div className="text-muted">
                    {addr.addressLine2}, {addr.city}
                  </div>
                  {addr.orderNote && (
                    <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                      Ghi chú: {addr.orderNote}
                    </div>
                  )}
                </div>
                <div className="text-nowrap">
                  <Button variant="link" size="sm" className="p-0 me-3" onClick={() => handleEdit(addr)}>
                    Sửa
                  </Button>
                  <Button variant="link" size="sm" className="p-0 text-danger" onClick={() => handleDelete(addr._id)}>
                    Xóa
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {(!user?.addresses || user.addresses.length === 0) && (
            <div className="small text-muted">Chưa có địa chỉ nào được lưu</div>
          )}
        </Stack>
      </Card.Body>
    </Card>
  );
}
