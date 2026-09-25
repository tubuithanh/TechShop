import { useEffect, useState } from 'react';
import { Card, Form, Table } from 'react-bootstrap';
import { orderService } from '../../services/orderService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';

const statusOptions = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled', 'returned'];

// Phải khớp với ORDER_STATUS_TRANSITIONS ở backend/controllers/orderController.js - trước đây
// dropdown liệt kê đủ cả 7 trạng thái cho MỌI đơn hàng bất kể trạng thái hiện tại, nên admin có thể
// chọn 1 bước chuyển mà backend chắc chắn từ chối (VD: "Đã giao hàng" -> "Chờ xác nhận"), gây lỗi
// 400 âm thầm (không có try/catch) và dropdown vẫn hiển thị lựa chọn không được lưu.
const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipping', 'cancelled'],
  shipping: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: []
};

const statusLabel = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả'
};

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;

  const loadOrders = () =>
    orderService.getAllOrdersAdmin({ status: filterStatus, page, limit: pageSize }).then((res) => {
      setOrders(res.data);
      setTotalPages(res.totalPages || 1);
      setTotal(res.total || 0);
    });

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, page, pageSize]);

  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setPage(1);
  };

  const handleChangeStatus = async (orderId, status) => {
    try {
      await orderService.updateOrderStatus(orderId, status, `Cập nhật trạng thái: ${statusLabel[status]}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái đơn hàng');
    }
    // Luôn tải lại dù thành công hay thất bại - dropdown đang hiển thị lựa chọn người dùng vừa
    // chọn (chưa chắc đã lưu), tải lại để đồng bộ đúng trạng thái thật từ server.
    loadOrders();
  };

  return (
    <div>
      <h1 className="fs-4 fw-bold mb-4">Quản lý đơn hàng</h1>

      <Form.Select
        value={filterStatus}
        onChange={(e) => handleFilterChange(e.target.value)}
        className="mb-4"
        style={{ maxWidth: '20rem' }}
      >
        <option value="">Tất cả trạng thái</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {statusLabel[s]}
          </option>
        ))}
      </Form.Select>

      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Mã đơn</th>
              <th className="p-3">Khách hàng</th>
              <th className="p-3">Cửa hàng</th>
              <th className="p-3">Tổng tiền</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id}>
                <td className="p-3">{o.orderCode}</td>
                <td className="p-3">
                  {o.userId?.displayName}
                  <div className="small text-muted">{o.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{o.storeId?.name}</td>
                <td className="p-3">{formatVND(o.grandTotal)}</td>
                <td className="p-3">{statusLabel[o.status]}</td>
                <td className="p-3">
                  <Form.Select
                    size="sm"
                    value={o.status}
                    disabled={ORDER_STATUS_TRANSITIONS[o.status]?.length === 0}
                    onChange={(e) => handleChangeStatus(o._id, e.target.value)}
                  >
                    <option value={o.status}>{statusLabel[o.status]}</option>
                    {(ORDER_STATUS_TRANSITIONS[o.status] || []).map((s) => (
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
        <Card.Body className="pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </Card.Body>
      </Card>
    </div>
  );
}
