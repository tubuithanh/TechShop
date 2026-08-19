import { useEffect, useState } from 'react';
import { Card, Form, Table } from 'react-bootstrap';
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
      <h1 className="fs-4 fw-bold mb-4">Quản lý yêu cầu bảo hành</h1>
      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Mã phiếu</th>
              <th className="p-3">Khách hàng</th>
              <th className="p-3">Sản phẩm</th>
              <th className="p-3">Mô tả lỗi</th>
              <th className="p-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {warranties.map((w) => (
              <tr key={w._id}>
                <td className="p-3">{w.ticketCode}</td>
                <td className="p-3">
                  {w.userId?.displayName}
                  <div className="small text-muted">{w.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{w.productId?.title}</td>
                <td className="p-3 text-truncate" style={{ maxWidth: '20rem' }}>
                  {w.issueDescription}
                </td>
                <td className="p-3">
                  <Form.Select
                    size="sm"
                    value={w.status}
                    onChange={(e) => handleChangeStatus(w._id, e.target.value)}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </Form.Select>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
