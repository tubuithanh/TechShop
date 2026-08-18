import { useEffect, useState } from 'react';
import { orderService } from '../../services/orderService';

const statusOptions = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled', 'returned'];
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

  const loadOrders = () => orderService.getAllOrdersAdmin({ status: filterStatus }).then((res) => setOrders(res.data));

  useEffect(() => {
    loadOrders();
  }, [filterStatus]);

  const handleChangeStatus = async (orderId, status) => {
    await orderService.updateOrderStatus(orderId, status, `Cập nhật trạng thái: ${statusLabel[status]}`);
    loadOrders();
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Quản lý đơn hàng</h1>

      <select
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value)}
        className="border rounded px-3 py-2 text-sm mb-4"
      >
        <option value="">Tất cả trạng thái</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {statusLabel[s]}
          </option>
        ))}
      </select>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
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
              <tr key={o._id} className="border-b">
                <td className="p-3">{o.orderCode}</td>
                <td className="p-3">
                  {o.userId?.displayName}
                  <div className="text-xs text-gray-400">{o.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{o.storeId?.name}</td>
                <td className="p-3">{formatVND(o.grandTotal)}</td>
                <td className="p-3">{statusLabel[o.status]}</td>
                <td className="p-3">
                  <select
                    value={o.status}
                    onChange={(e) => handleChangeStatus(o._id, e.target.value)}
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
