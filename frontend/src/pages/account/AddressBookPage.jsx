import { useState } from 'react';
import { Card, Button, Form, Stack, Badge, ButtonGroup } from 'react-bootstrap';
import { useAuth } from '../../store/AuthContext';
import { userService } from '../../services/userService';

const LABEL_PRESETS = ['Nhà riêng', 'Công ty'];

const emptyForm = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  orderNote: '',
  label: 'Nhà riêng',
  isDefault: false
};

export default function AddressBookPage() {
  const { user, setUser } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [savingDefaultId, setSavingDefaultId] = useState(null);

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
    setForm({ ...emptyForm, ...addr });
    setEditingId(addr._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa địa chỉ này?')) return;
    const addresses = await userService.deleteAddress(id);
    refreshUser(addresses);
  };

  const handleSetDefault = async (id) => {
    setSavingDefaultId(id);
    try {
      const addresses = await userService.setDefaultAddress(id);
      refreshUser(addresses);
    } finally {
      setSavingDefaultId(null);
    }
  };

  const editingIsCurrentDefault = editingId && form.isDefault;

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

            <Form.Group className="mb-2">
              <Form.Label className="small fw-medium mb-1">Loại địa chỉ</Form.Label>
              <div className="d-flex align-items-center gap-2">
                <ButtonGroup size="sm">
                  {LABEL_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      variant={form.label === preset ? 'dark' : 'outline-secondary'}
                      onClick={() => setForm({ ...form, label: preset })}
                    >
                      {preset}
                    </Button>
                  ))}
                </ButtonGroup>
                <Form.Control
                  size="sm"
                  placeholder="Hoặc tự đặt tên (VD: Nhà bố mẹ, Kho hàng...)"
                  value={LABEL_PRESETS.includes(form.label) ? '' : form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                id="isDefaultAddress"
                label="Đặt làm địa chỉ mặc định"
                checked={form.isDefault}
                disabled={editingIsCurrentDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              {editingIsCurrentDefault && (
                <Form.Text className="text-muted">
                  Đây đang là địa chỉ mặc định. Để bỏ, hãy đặt một địa chỉ khác làm mặc định.
                </Form.Text>
              )}
            </Form.Group>

            <Button type="submit" variant="dark" size="sm">
              {editingId ? 'Cập nhật' : 'Lưu địa chỉ'}
            </Button>
          </Form>
        )}

        <Stack gap={3}>
          {(user?.addresses || []).map((addr) => (
            <Card key={addr._id} body className={`small ${addr.isDefault ? 'border-dark' : ''}`}>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <Badge bg="secondary">{addr.label || 'Nhà riêng'}</Badge>
                    {addr.isDefault && <Badge bg="dark">Mặc định</Badge>}
                  </div>
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
                <div className="text-nowrap text-end">
                  {!addr.isDefault && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 me-3"
                      disabled={savingDefaultId === addr._id}
                      onClick={() => handleSetDefault(addr._id)}
                    >
                      {savingDefaultId === addr._id ? 'Đang đặt...' : 'Đặt làm mặc định'}
                    </Button>
                  )}
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
