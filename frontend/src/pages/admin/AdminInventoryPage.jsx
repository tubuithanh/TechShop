import { useEffect, useState } from 'react';
import { storeInventoryService } from '../../services/storeInventoryService';
import { storeService } from '../../services/storeService';
import { productService } from '../../services/productService';
import api from '../../services/api';

export default function AdminInventoryPage() {
  const [inventories, setInventories] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [form, setForm] = useState({ productId: '', stock: 0, lowStockThreshold: 5 });

  const loadInventories = (storeId) =>
    storeInventoryService.getInventories(storeId ? { storeId } : {}).then(setInventories);

  useEffect(() => {
    storeService.getStores().then((data) => {
      setStores(data);
      if (data.length > 0) setSelectedStoreId(data[0]._id);
    });
    productService.getProducts({ limit: 100 }).then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    if (selectedStoreId) loadInventories(selectedStoreId);
  }, [selectedStoreId]);

  const handleUpsert = async (e) => {
    e.preventDefault();
    await api.post('/store-inventories', { ...form, storeId: selectedStoreId, stock: Number(form.stock) });
    setForm({ productId: '', stock: 0, lowStockThreshold: 5 });
    loadInventories(selectedStoreId);
  };

  const handleQuickUpdate = async (id, newStock) => {
    await api.put(`/store-inventories/${id}`, { stock: Number(newStock) });
    loadInventories(selectedStoreId);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">Quản lý tồn kho theo cửa hàng</h1>
      <p className="text-sm text-gray-500 mb-4">
        Mô hình đa chi nhánh: mỗi cửa hàng quản lý tồn kho riêng cho từng sản phẩm.
      </p>

      <select
        value={selectedStoreId}
        onChange={(e) => setSelectedStoreId(e.target.value)}
        className="border rounded px-3 py-2 text-sm mb-4"
      >
        {stores.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name} — {s.city}
          </option>
        ))}
      </select>

      <form onSubmit={handleUpsert} className="bg-white rounded-lg p-4 shadow-sm mb-6 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Sản phẩm</label>
          <select
            required
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">-- Chọn sản phẩm --</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Số lượng tồn</label>
          <input
            required
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            className="border rounded px-3 py-2 text-sm w-28"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Ngưỡng cảnh báo thấp</label>
          <input
            type="number"
            min={0}
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            className="border rounded px-3 py-2 text-sm w-28"
          />
        </div>
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm">
          Thiết lập tồn kho
        </button>
      </form>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Sản phẩm</th>
              <th className="p-3">Tồn kho</th>
              <th className="p-3">Ngưỡng cảnh báo</th>
              <th className="p-3">Cập nhật lần cuối</th>
              <th className="p-3">Thao tác nhanh</th>
            </tr>
          </thead>
          <tbody>
            {inventories.map((inv) => (
              <tr key={inv._id} className={`border-b ${inv.stock <= inv.lowStockThreshold ? 'bg-red-50' : ''}`}>
                <td className="p-3">{inv.productId?.title}</td>
                <td className="p-3 font-medium">
                  {inv.stock}
                  {inv.stock <= inv.lowStockThreshold && <span className="text-red-600 text-xs ml-2">⚠ Sắp hết</span>}
                </td>
                <td className="p-3">{inv.lowStockThreshold}</td>
                <td className="p-3 text-xs text-gray-400">{new Date(inv.lastUpdated).toLocaleString('vi-VN')}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleQuickUpdate(inv._id, inv.stock + 10)}
                      className="text-xs border rounded px-2 py-1"
                    >
                      +10
                    </button>
                    <button
                      onClick={() => handleQuickUpdate(inv._id, Math.max(0, inv.stock - 10))}
                      className="text-xs border rounded px-2 py-1"
                    >
                      -10
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {inventories.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">
                  Chưa có dữ liệu tồn kho cho cửa hàng này
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
