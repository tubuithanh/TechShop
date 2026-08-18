import { useEffect, useState } from 'react';
import api from '../../services/api';
import { productService } from '../../services/productService';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

const emptyForm = {
  title: '',
  brandId: '',
  categoryId: '',
  price: '',
  salePrice: '',
  description: '',
  featuredImage: 'https://via.placeholder.com/400x400?text=San+pham',
  imageURLs: []
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadProducts = () => productService.getProducts({ limit: 50 }).then((res) => setProducts(res.data));

  useEffect(() => {
    loadProducts();
    productService.getCategories().then(setCategories);
    productService.getBrands().then(setBrands);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price),
      salePrice: Number(form.salePrice) || undefined,
      imageURLs: [form.featuredImage]
    };
    if (editingId) {
      await api.put(`/products/${editingId}`, payload);
    } else {
      await api.post('/products', payload);
    }
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
    loadProducts();
  };

  const handleEdit = (p) => {
    setForm({
      title: p.title,
      brandId: p.brandId?._id || p.brandId || '',
      categoryId: p.categoryId?._id || p.categoryId || '',
      price: p.price,
      salePrice: p.salePrice || '',
      description: p.description || '',
      featuredImage: p.featuredImage,
      imageURLs: p.imageURLs || []
    });
    setEditingId(p._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa (ẩn) sản phẩm này khỏi cửa hàng?')) return;
    await api.delete(`/products/${id}`);
    loadProducts();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Quản lý sản phẩm</h1>
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="bg-red-600 text-white px-4 py-2 rounded text-sm"
        >
          {showForm ? 'Đóng form' : '+ Thêm sản phẩm'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-4 shadow-sm mb-6 grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Tên sản phẩm"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <select
            required
            value={form.brandId}
            onChange={(e) => setForm({ ...form, brandId: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">-- Chọn thương hiệu --</option>
            {brands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">-- Chọn danh mục --</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            placeholder="Giá gốc"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Giá khuyến mãi (tùy chọn)"
            value={form.salePrice}
            onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Link ảnh sản phẩm"
            value={form.featuredImage}
            onChange={(e) => setForm({ ...form, featuredImage: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Mô tả sản phẩm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="border rounded px-3 py-2 text-sm col-span-2"
          />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm col-span-2">
            {editingId ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Sản phẩm</th>
              <th className="p-3">Thương hiệu</th>
              <th className="p-3">Giá</th>
              <th className="p-3">Đã bán</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id} className="border-b">
                <td className="p-3">{p.title}</td>
                <td className="p-3">{p.brandId?.name}</td>
                <td className="p-3">{formatVND(p.salePrice || p.price)}</td>
                <td className="p-3">{p.soldCount}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => handleEdit(p)} className="text-blue-600">
                    Sửa
                  </button>
                  <button onClick={() => handleDelete(p._id)} className="text-red-600">
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500 bg-yellow-50 border border-yellow-200 rounded p-3">
        💡 Tồn kho được quản lý riêng theo từng cửa hàng (mô hình multi-store). Vào mục
        <strong> "Quản lý tồn kho theo cửa hàng"</strong> để thiết lập số lượng cho từng chi nhánh sau khi tạo sản phẩm.
      </div>
    </div>
  );
}
