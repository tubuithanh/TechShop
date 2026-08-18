import { useState } from 'react';
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
    <div className="bg-white border rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold">Sổ địa chỉ</h2>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="text-sm bg-red-600 text-white px-3 py-1.5 rounded"
        >
          {showForm ? 'Đóng' : '+ Thêm địa chỉ'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded p-4 mb-4 space-y-2 max-w-md">
          <input
            required
            placeholder="Địa chỉ (số nhà, đường)"
            value={form.addressLine1}
            onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Phường/Xã, Quận/Huyện"
            value={form.addressLine2}
            onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Tỉnh/Thành phố"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Ghi chú giao hàng (tùy chọn)"
            value={form.orderNote}
            onChange={(e) => setForm({ ...form, orderNote: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded text-sm">
            {editingId ? 'Cập nhật' : 'Lưu địa chỉ'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {(user?.addresses || []).map((addr) => (
          <div key={addr._id} className="border rounded p-3 text-sm flex justify-between items-start">
            <div>
              <div className="text-gray-800">{addr.addressLine1}</div>
              <div className="text-gray-500">
                {addr.addressLine2}, {addr.city}
              </div>
              {addr.orderNote && <div className="text-xs text-gray-400 mt-1">Ghi chú: {addr.orderNote}</div>}
            </div>
            <div className="space-x-2 whitespace-nowrap">
              <button onClick={() => handleEdit(addr)} className="text-blue-600">
                Sửa
              </button>
              <button onClick={() => handleDelete(addr._id)} className="text-red-600">
                Xóa
              </button>
            </div>
          </div>
        ))}
        {(!user?.addresses || user.addresses.length === 0) && (
          <div className="text-sm text-gray-400">Chưa có địa chỉ nào được lưu</div>
        )}
      </div>
    </div>
  );
}
