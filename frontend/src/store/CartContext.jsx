// store/CartContext.jsx - xem chú thích từng dòng bên dưới
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cartService } from '../services/cartService'; // gọi API /api/cart
import { useAuth } from './AuthContext';

const CartContext = createContext(null); // kênh chia sẻ giỏ hàng

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [] }); // giỏ hiện tại
  const [loading, setLoading] = useState(false);

  // Chỉ tài khoản khách hàng có giỏ hàng (API giỏ hàng từ chối nhân viên / admin)
  const customerId = user?.role === 'customer' ? user._id : null; // chỉ khách hàng có giỏ
  const refreshCart = useCallback(async () => { // useCallback: giữ nguyên hàm giữa các lần render
    if (!customerId) return; // không phải khách -> không gọi API
    setLoading(true);
    try {
      const data = await cartService.getCart();
      setCart(data);
    } catch {
      setCart({ items: [] });
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Nạp lại giỏ hàng khi đăng nhập; xóa giỏ hàng khỏi state khi đăng xuất
  // để tránh hiện số lượng giỏ hàng của người dùng trước đó.
  useEffect(() => {
    if (customerId) {
      refreshCart();
    } else {
      setCart({ items: [] });
    }
  }, [customerId, refreshCart]);

  // storeId: cửa hàng khách chọn để mua (mô hình multi-store) - có thể null nếu chưa chọn
  const addToCart = async (productId, variantId, quantity = 1, storeId = null) => { // lỗi (hết hàng) -> ném ra cho trang hiển thị
    const data = await cartService.addItem({ productId, variantId, quantity, storeId }); // API trả giỏ mới
    setCart(data);
  };

  const updateQuantity = async (itemId, quantity) => {
    const data = await cartService.updateItem(itemId, quantity);
    setCart(data);
  };

  const removeFromCart = async (itemId) => {
    const data = await cartService.removeItem(itemId);
    setCart(data);
  };

  const totalAmount = cart.items?.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) || 0; // tổng tiền (chỉ hiển thị; backend tính lại khi đặt)
  const totalItems = cart.items?.reduce((sum, i) => sum + i.quantity, 0) || 0; // tổng số món (huy hiệu trên icon giỏ)

  return (
    <CartContext.Provider
      value={{ cart, loading, refreshCart, addToCart, updateQuantity, removeFromCart, totalAmount, totalItems }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
