import { useEffect, useState } from 'react';
import { voucherService } from '../../services/voucherService';

const emptyForm = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscountAmount: '',
  minOrderValue: 0,
  usageLimit: 0,
  endDate: ''
};

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = () => voucherService.getAll().then(setVouchers);

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await voucherService.create({
      ...form,
      discountValue: Number(form.discountValue),
      maxDiscountAmount: Number(form.maxDiscountAmount) || undefined,
      minOrderValue: Number(form.minOrderValue) || 0,
      usageLimit: Number(form.usageLimit) || 0
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
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Quản lý khuyến mãi / Voucher</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-red-600 text-white px-4 py-2 rounded text-sm">
          {showForm ? 'Đóng form' : '+ Tạo voucher'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-4 shadow-sm mb-6 grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Mã voucher (VD: SALE20)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="border rounded px-3 py-2 text-sm"
          />
          <select
            value={form.discountType}
            onChange={(e) => setForm({ ...form, discountType: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="percent">Giảm theo %</option>
            <option value="fixed">Giảm số tiền cố định</option>
          </select>
          <input
            required
            type="number"
            placeholder={form.discountType === 'percent' ? 'Phần trăm giảm (VD: 10)' : 'Số tiền giảm (VNĐ)'}
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          {form.discountType === 'percent' && (
            <input
              type="number"
              placeholder="Giảm tối đa (VNĐ)"
              value={form.maxDiscountAmount}
              onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
              className="border rounded px-3 py-2 text-sm"
            />
          )}
          <input
            type="number"
            placeholder="Giá trị đơn tối thiểu"
            value={form.minOrderValue}
            onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Giới hạn lượt dùng (0 = không giới hạn)"
            value={form.usageLimit}
            onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Mô tả"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="border rounded px-3 py-2 text-sm col-span-2"
          />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm col-span-2">
            Tạo voucher
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Mã</th>
              <th className="p-3">Mô tả</th>
              <th className="p-3">Giảm giá</th>
              <th className="p-3">Đã dùng</th>
              <th className="p-3">Hết hạn</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v._id} className="border-b">
                <td className="p-3 font-medium">{v.code}</td>
                <td className="p-3">{v.description}</td>
                <td className="p-3">
                  {v.discountType === 'percent' ? `${v.discountValue}%` : `${v.discountValue.toLocaleString()}đ`}
                </td>
                <td className="p-3">
                  {v.usedCount} / {v.usageLimit || '∞'}
                </td>
                <td className="p-3">{new Date(v.endDate).toLocaleDateString('vi-VN')}</td>
                <td className="p-3">{v.isActive ? 'Hoạt động' : 'Đã tắt'}</td>
                <td className="p-3">
                  <button onClick={() => handleRemove(v._id)} className="text-red-600">
                    Vô hiệu hóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
