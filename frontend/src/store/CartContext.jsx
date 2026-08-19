import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cartService } from '../services/cartService';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [] });
  const [loading, setLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await cartService.getCart();
      setCart(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Nạp lại giỏ hàng khi đăng nhập; xóa giỏ hàng khỏi state khi đăng xuất
  // để tránh hiện số lượng giỏ hàng của người dùng trước đó.
  useEffect(() => {
    if (user) {
      refreshCart();
    } else {
      setCart({ items: [] });
    }
  }, [user, refreshCart]);

  // storeId: cửa hàng khách chọn để mua (mô hình multi-store) - có thể null nếu chưa chọn
  const addToCart = async (productId, quantity = 1, storeId = null) => {
    const data = await cartService.addItem({ productId, quantity, storeId });
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

  const totalAmount = cart.items?.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) || 0;
  const totalItems = cart.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;

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
