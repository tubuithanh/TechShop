import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');

  const keyword = searchParams.get('keyword') || '';
  const categoryId = searchParams.get('categoryId') || '';

  useEffect(() => {
    productService.getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    productService
      .getProducts({ keyword, categoryId, sort, limit: 20 })
      .then((res) => setProducts(res.data))
      .finally(() => setLoading(false));
  }, [keyword, categoryId, sort]);

  const handleCategoryChange = (catId) => {
    const params = Object.fromEntries(searchParams.entries());
    if (catId) params.categoryId = catId;
    else delete params.categoryId;
    setSearchParams(params);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
      <aside className="md:col-span-1">
        <h3 className="font-bold mb-2">Danh mục</h3>
        <ul className="space-y-1 mb-6">
          <li>
            <button onClick={() => handleCategoryChange('')} className={`text-sm ${!categoryId ? 'text-red-600 font-medium' : ''}`}>
              Tất cả
            </button>
          </li>
          {categories.map((c) => (
            <li key={c._id}>
              <button
                onClick={() => handleCategoryChange(c._id)}
                className={`text-sm ${categoryId === c._id ? 'text-red-600 font-medium' : ''}`}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="md:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">
            {keyword ? `Kết quả tìm kiếm: "${keyword}"` : 'Danh sách sản phẩm'} ({products.length})
          </h2>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="newest">Mới nhất</option>
            <option value="price_asc">Giá tăng dần</option>
            <option value="price_desc">Giá giảm dần</option>
            <option value="best_selling">Bán chạy</option>
            <option value="top_rated">Đánh giá cao</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-10">Đang tải...</div>
        ) : products.length === 0 ? (
          <div className="text-center py-10 text-gray-500">Không tìm thấy sản phẩm phù hợp</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
