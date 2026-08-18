import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [productRes, categoryRes] = await Promise.all([
          productService.getProducts({ sort: 'newest', limit: 8 }),
          productService.getCategories()
        ]);
        setProducts(productRes.data);
        setCategories(categoryRes);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-lg p-8 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Chào mừng đến với TechShop</h1>
        <p className="opacity-90">
          Đồ án tốt nghiệp – Website thương mại điện tử đa chi nhánh (multi-store), xây dựng bằng MERN Stack
        </p>
      </div>

      <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
        {categories.map((c) => (
          <Link
            key={c._id}
            to={`/products?categoryId=${c._id}`}
            className="flex-shrink-0 bg-white border rounded-lg px-5 py-3 text-center hover:shadow"
          >
            {c.name}
          </Link>
        ))}
      </div>

      <h2 className="text-lg font-bold mb-4">Sản phẩm mới nhất</h2>
      {loading ? (
        <div className="text-center py-10">Đang tải sản phẩm...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}

      <div className="text-center mt-6">
        <Link to="/products" className="text-red-600 font-medium hover:underline">
          Xem tất cả sản phẩm →
        </Link>
      </div>
    </div>
  );
}
