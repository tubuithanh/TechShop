import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderService } from '../services/orderService';

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

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orderService.getMyOrders().then(setOrders).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16">Đang tải...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Đơn hàng của tôi</h1>
      {orders.length === 0 ? (
        <div className="text-gray-500">Bạn chưa có đơn hàng nào.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o._id} to={`/account/orders/${o._id}`} className="block border rounded-lg p-4 hover:shadow">
              <div className="flex justify-between mb-1">
                <span className="font-medium">#{o.orderCode}</span>
                <span className="text-sm text-blue-600">{statusLabel[o.status]}</span>
              </div>
              <div className="text-sm text-gray-500">
                {o.items.length} sản phẩm · {o.storeId?.name} · {new Date(o.createdAt).toLocaleDateString('vi-VN')}
              </div>
              <div className="text-red-600 font-bold mt-1">{formatVND(o.grandTotal)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
