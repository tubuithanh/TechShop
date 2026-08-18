import { useEffect, useState } from 'react';
import { userService } from '../../services/userService';
import ProductCard from '../../components/ProductCard';

export default function WishlistPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userService.getWishlist().then(setProducts).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10">Đang tải...</div>;

  return (
    <div className="bg-white border rounded-lg p-5">
      <h2 className="font-bold mb-4">Sản phẩm yêu thích ({products.length})</h2>
      {products.length === 0 ? (
        <div className="text-sm text-gray-400">Bạn chưa yêu thích sản phẩm nào. Bấm ♡ trên trang sản phẩm để lưu lại.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
