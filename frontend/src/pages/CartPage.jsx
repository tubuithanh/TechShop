import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CartPage() {
  const { cart, refreshCart, updateQuantity, removeFromCart, totalAmount } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) refreshCart();
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="mb-4">Vui lòng đăng nhập để xem giỏ hàng của bạn.</p>
        <Link to="/login" className="text-red-600 underline">
          Đăng nhập ngay
        </Link>
      </div>
    );
  }

  if (!cart.items || cart.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="mb-4">Giỏ hàng của bạn đang trống.</p>
        <Link to="/products" className="text-red-600 underline">
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Giỏ hàng của bạn</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          {cart.items.map((item) => (
            <div key={item._id} className="flex items-center gap-4 border rounded-lg p-3">
              <img src={item.image || 'https://via.placeholder.com/80'} alt={item.name} className="w-20 h-20 object-contain" />
              <div className="flex-1">
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-red-600 font-bold">{formatVND(item.unitPrice)}</div>
              </div>
              <div className="flex items-center border rounded">
                <button onClick={() => updateQuantity(item._id, item.quantity - 1)} className="px-2 py-1">
                  -
                </button>
                <span className="px-3">{item.quantity}</span>
                <button onClick={() => updateQuantity(item._id, item.quantity + 1)} className="px-2 py-1">
                  +
                </button>
              </div>
              <button onClick={() => removeFromCart(item._id)} className="text-red-500 text-sm">
                Xóa
              </button>
            </div>
          ))}
        </div>

        <div className="border rounded-lg p-4 h-fit">
          <div className="flex justify-between mb-2">
            <span>Tạm tính</span>
            <span className="font-bold">{formatVND(totalAmount)}</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Phí vận chuyển sẽ được tính ở bước thanh toán</p>
          <button
            onClick={() => navigate('/checkout')}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded"
          >
            Tiến hành thanh toán
          </button>
        </div>
      </div>
    </div>
  );
}
