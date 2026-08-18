import { useEffect, useState } from 'react';
import api from '../../services/api';

const statusOptions = ['received', 'checking', 'repairing', 'waiting_parts', 'done', 'returned'];
const statusLabel = {
  received: 'Đã tiếp nhận',
  checking: 'Đang kiểm tra',
  repairing: 'Đang sửa chữa',
  waiting_parts: 'Chờ linh kiện',
  done: 'Đã sửa xong',
  returned: 'Đã trả máy'
};

export default function AdminWarrantiesPage() {
  const [warranties, setWarranties] = useState([]);

  const loadWarranties = () => api.get('/warranties/admin/all').then((res) => setWarranties(res.data.data));

  useEffect(() => {
    loadWarranties();
  }, []);

  const handleChangeStatus = async (id, status) => {
    await api.put(`/warranties/${id}/status`, { status, note: `Cập nhật: ${statusLabel[status]}` });
    loadWarranties();
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Quản lý yêu cầu bảo hành</h1>
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Mã phiếu</th>
              <th className="p-3">Khách hàng</th>
              <th className="p-3">Sản phẩm</th>
              <th className="p-3">Mô tả lỗi</th>
              <th className="p-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {warranties.map((w) => (
              <tr key={w._id} className="border-b">
                <td className="p-3">{w.ticketCode}</td>
                <td className="p-3">
                  {w.userId?.displayName}
                  <div className="text-xs text-gray-400">{w.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{w.productId?.title}</td>
                <td className="p-3 max-w-xs truncate">{w.issueDescription}</td>
                <td className="p-3">
                  <select
                    value={w.status}
                    onChange={(e) => handleChangeStatus(w._id, e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
