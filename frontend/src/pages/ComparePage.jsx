import { useEffect, useState } from 'react';
import { productService } from '../services/productService';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function ComparePage() {
  const [allProducts, setAllProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareResult, setCompareResult] = useState([]);

  useEffect(() => {
    productService.getProducts({ limit: 50 }).then((res) => setAllProducts(res.data));
  }, []);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)));
  };

  const handleCompare = async () => {
    const result = await productService.compare(selectedIds);
    setCompareResult(result);
  };

  const allSpecKeys = [...new Set(compareResult.flatMap((p) => Object.keys(p.specifications || {})))];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">So sánh sản phẩm</h1>
      <p className="text-sm text-gray-500 mb-3">Chọn tối đa 4 sản phẩm để so sánh song song thông số kỹ thuật</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {allProducts.map((p) => (
          <label
            key={p._id}
            className={`border rounded p-2 text-sm flex items-center gap-2 cursor-pointer ${
              selectedIds.includes(p._id) ? 'border-red-600 bg-red-50' : ''
            }`}
          >
            <input type="checkbox" checked={selectedIds.includes(p._id)} onChange={() => toggleSelect(p._id)} />
            {p.title}
          </label>
        ))}
      </div>

      <button
        onClick={handleCompare}
        disabled={selectedIds.length < 2}
        className="bg-red-600 text-white px-6 py-2 rounded disabled:opacity-50 mb-6"
      >
        So sánh ({selectedIds.length})
      </button>

      {compareResult.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead>
              <tr>
                <th className="border p-2 bg-gray-50 text-left">Thông số</th>
                {compareResult.map((p) => (
                  <th key={p._id} className="border p-2 bg-gray-50">
                    <img src={p.featuredImage} alt={p.title} className="w-20 h-20 object-contain mx-auto mb-1" />
                    {p.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-2 font-medium">Giá</td>
                {compareResult.map((p) => (
                  <td key={p._id} className="border p-2 text-center text-red-600 font-bold">
                    {formatVND(p.salePrice || p.price)}
                  </td>
                ))}
              </tr>
              {allSpecKeys.map((key) => (
                <tr key={key}>
                  <td className="border p-2 font-medium">{key}</td>
                  {compareResult.map((p) => (
                    <td key={p._id} className="border p-2 text-center">
                      {p.specifications?.[key] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
