import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { orderService } from '../services/orderService';
import { storeService } from '../services/storeService';
import api from '../services/api';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CheckoutPage() {
  const { cart, totalAmount, refreshCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const defaultAddress = user?.addresses?.[0];
  const [address, setAddress] = useState({
    fullName: user?.displayName || '',
    phone: user?.phoneNumber || '',
    addressLine1: defaultAddress?.addressLine1 || '',
    addressLine2: defaultAddress?.addressLine2 || '',
    city: defaultAddress?.city || '',
    state: defaultAddress?.state || '',
    pincode: defaultAddress?.pincode || ''
  });
  const [deliveryMethod, setDeliveryMethod] = useState('home_delivery');
  const [paymentMode, setPaymentMode] = useState('cod');
  const [voucherCode, setVoucherCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [voucherMsg, setVoucherMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    storeService.getStores().then((data) => {
      setStores(data);
      if (data.length > 0) setSelectedStoreId(data[0]._id);
    });
  }, []);

  const shippingFee = deliveryMethod === 'store_pickup' ? 0 : 30000;
  const grandTotal = Math.max(totalAmount + shippingFee - discount, 0);

  const applyVoucher = async () => {
    try {
      const { data } = await api.post('/vouchers/validate', { code: voucherCode, orderValue: totalAmount });
      setDiscount(data.data.discountAmount);
      setVoucherMsg('Áp dụng mã giảm giá thành công!');
    } catch (err) {
      setDiscount(0);
      setVoucherMsg(err.response?.data?.message || 'Mã không hợp lệ');
    }
  };

  const handlePlaceOrder = async () => {
    setError('');
    if (!selectedStoreId) {
      setError('Vui lòng chọn cửa hàng xử lý đơn hàng');
      return;
    }
    setSubmitting(true);
    try {
      const order = await orderService.createOrder({
        storeId: selectedStoreId,
        deliveryAddress: address,
        deliveryMethod,
        paymentMode,
        voucherCode: discount > 0 ? voucherCode : undefined
      });
      await refreshCart();
      navigate(`/account/orders/${order._id}`, { state: { justPlaced: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Đặt hàng thất bại, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.items || cart.items.length === 0) {
    return <div className="text-center py-16">Giỏ hàng trống, không thể thanh toán.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-6">Thanh toán đơn hàng</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="font-medium mb-3">Chọn cửa hàng xử lý đơn hàng</h2>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-4"
          >
            {stores.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} — {s.city}
              </option>
            ))}
          </select>

          <h2 className="font-medium mb-3">Địa chỉ nhận hàng</h2>
          <div className="space-y-2">
            <input
              placeholder="Họ và tên"
              value={address.fullName}
              onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
            <input
              placeholder="Số điện thoại"
              value={address.phone}
              onChange={(e) => setAddress({ ...address, phone: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
            <input
              placeholder="Địa chỉ (số nhà, đường)"
              value={address.addressLine1}
              onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
            <input
              placeholder="Phường/Xã, Quận/Huyện"
              value={address.addressLine2}
              onChange={(e) => setAddress({ ...address, addressLine2: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
            <input
              placeholder="Tỉnh/Thành phố"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <h2 className="font-medium mt-6 mb-3">Hình thức nhận hàng</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={deliveryMethod === 'home_delivery'}
                onChange={() => setDeliveryMethod('home_delivery')}
              />
              Giao hàng tận nơi (30.000đ)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={deliveryMethod === 'store_pickup'}
                onChange={() => setDeliveryMethod('store_pickup')}
              />
              Nhận tại cửa hàng đã chọn (miễn phí)
            </label>
          </div>

          <h2 className="font-medium mt-6 mb-3">Phương thức thanh toán</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={paymentMode === 'cod'} onChange={() => setPaymentMode('cod')} />
              Thanh toán khi nhận hàng (COD)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={paymentMode === 'vnpay'} onChange={() => setPaymentMode('vnpay')} />
              Thanh toán qua VNPay (demo/sandbox)
            </label>
          </div>
        </div>

        <div>
          <h2 className="font-medium mb-3">Đơn hàng của bạn</h2>
          <div className="border rounded-lg divide-y mb-4">
            {cart.items.map((item) => (
              <div key={item._id} className="flex justify-between p-3 text-sm">
                <span>
                  {item.name} x{item.quantity}
                </span>
                <span>{formatVND(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            <input
              placeholder="Nhập mã giảm giá"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <button onClick={applyVoucher} className="bg-gray-800 text-white px-4 rounded text-sm">
              Áp dụng
            </button>
          </div>
          {voucherMsg && <div className="text-xs mb-3 text-gray-600">{voucherMsg}</div>}

          <div className="border rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Tạm tính</span>
              <span>{formatVND(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Phí vận chuyển</span>
              <span>{formatVND(shippingFee)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Giảm giá</span>
                <span>-{formatVND(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Tổng cộng</span>
              <span className="text-red-600">{formatVND(grandTotal)}</span>
            </div>
          </div>

          {error && <div className="text-red-600 text-sm mt-3">{error}</div>}

          <button
            onClick={handlePlaceOrder}
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded mt-4 disabled:opacity-50"
          >
            {submitting ? 'Đang xử lý...' : 'Đặt hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}
