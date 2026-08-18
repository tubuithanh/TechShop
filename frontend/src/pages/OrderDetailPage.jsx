import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { orderService } from '../services/orderService';
import { warrantyService } from '../services/warrantyService';
import { io } from 'socket.io-client';
import { getAccessToken } from '../services/api';

const statusSteps = ['pending', 'confirmed', 'processing', 'shipping', 'delivered'];
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

export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [warrantyForm, setWarrantyForm] = useState({ productId: '', issueDescription: '' });
  const [warrantyMsg, setWarrantyMsg] = useState('');

  useEffect(() => {
    orderService.getOrderById(id).then(setOrder);
  }, [id]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = io('/', { auth: { token } });
    socket.on('order:statusUpdated', (payload) => {
      if (payload.orderId === id) {
        orderService.getOrderById(id).then(setOrder);
      }
    });
    return () => socket.disconnect();
  }, [id]);

  const handleCancel = async () => {
    if (!confirm('Bạn chắc chắn muốn hủy đơn hàng này?')) return;
    const updated = await orderService.cancelOrder(id, 'Khách hàng yêu cầu hủy');
    setOrder(updated);
  };

  const handleWarrantyRequest = async (e) => {
    e.preventDefault();
    try {
      await warrantyService.createRequest({ orderId: id, ...warrantyForm });
      setWarrantyMsg('Đã gửi yêu cầu bảo hành thành công! Vui lòng theo dõi trong mục "Bảo hành".');
    } catch (err) {
      setWarrantyMsg(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  if (!order) return <div className="text-center py-16">Đang tải...</div>;

  const currentStepIndex = statusSteps.indexOf(order.status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {location.state?.justPlaced && (
        <div className="bg-green-50 text-green-700 border border-green-200 rounded p-3 mb-4">
          🎉 Đặt hàng thành công! Mã đơn hàng của bạn là <strong>{order.orderCode}</strong>
        </div>
      )}

      <h1 className="text-xl font-bold mb-1">Đơn hàng #{order.orderCode}</h1>
      <p className="text-sm text-gray-500 mb-1">Đặt ngày {new Date(order.createdAt).toLocaleString('vi-VN')}</p>
      <p className="text-sm text-gray-500 mb-6">
        Xử lý tại: <strong>{order.storeId?.name}</strong> ({order.storeId?.address})
      </p>

      {order.status !== 'cancelled' && order.status !== 'returned' && (
        <div className="flex justify-between mb-8 text-xs">
          {statusSteps.map((s, idx) => (
            <div key={s} className="flex-1 text-center relative">
              <div
                className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-white ${
                  idx <= currentStepIndex ? 'bg-red-600' : 'bg-gray-300'
                }`}
              >
                {idx + 1}
              </div>
              <div className="mt-1">{statusLabel[s]}</div>
            </div>
          ))}
        </div>
      )}
      {order.status === 'cancelled' && (
        <div className="bg-red-50 text-red-700 rounded p-3 mb-6 text-sm">Đơn hàng đã bị hủy: {order.cancelReason}</div>
      )}

      <div className="border rounded-lg divide-y mb-4">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex justify-between p-3 text-sm">
            <span>
              {item.name} x{item.quantity}
            </span>
            <span>{formatVND(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-4 space-y-1 text-sm mb-6">
        <div className="flex justify-between">
          <span>Tạm tính</span>
          <span>{formatVND(order.itemsTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Phí vận chuyển</span>
          <span>{formatVND(order.shippingFee)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Giảm giá</span>
            <span>-{formatVND(order.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t pt-2">
          <span>Tổng cộng</span>
          <span className="text-red-600">{formatVND(order.grandTotal)}</span>
        </div>
      </div>

      <div className="text-sm mb-6">
        <div className="font-medium mb-1">Địa chỉ nhận hàng</div>
        <div>
          {order.deliveryAddress?.fullName} - {order.deliveryAddress?.phone}
        </div>
        <div>
          {order.deliveryAddress?.addressLine1}, {order.deliveryAddress?.addressLine2}, {order.deliveryAddress?.city}
        </div>
      </div>

      {['pending', 'confirmed'].includes(order.status) && (
        <button onClick={handleCancel} className="border border-red-600 text-red-600 px-4 py-2 rounded text-sm mb-8">
          Hủy đơn hàng
        </button>
      )}

      {order.status === 'delivered' && (
        <div className="border-t pt-6">
          <h3 className="font-bold mb-3">Gửi yêu cầu bảo hành</h3>
          <form onSubmit={handleWarrantyRequest} className="space-y-2 max-w-md">
            <select
              required
              value={warrantyForm.productId}
              onChange={(e) => setWarrantyForm({ ...warrantyForm, productId: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">-- Chọn sản phẩm cần bảo hành --</option>
              {order.items.map((item) => (
                <option key={item.productId} value={item.productId}>
                  {item.name}
                </option>
              ))}
            </select>
            <textarea
              required
              placeholder="Mô tả lỗi sản phẩm..."
              value={warrantyForm.issueDescription}
              onChange={(e) => setWarrantyForm({ ...warrantyForm, issueDescription: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              rows={3}
            />
            <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded text-sm">
              Gửi yêu cầu bảo hành
            </button>
          </form>
          {warrantyMsg && <div className="text-sm mt-2 text-green-600">{warrantyMsg}</div>}
        </div>
      )}
    </div>
  );
}
