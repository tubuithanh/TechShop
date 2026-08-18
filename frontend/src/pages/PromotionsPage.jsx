import { useEffect, useState } from 'react';
import api from '../services/api';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function PromotionsPage() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');

  useEffect(() => {
    api
      .get('/vouchers/active')
      .then((res) => setVouchers(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-2">Khuyến mãi & Ưu đãi</h1>
      <p className="text-sm text-gray-500 mb-6">Sao chép mã và áp dụng ngay tại bước thanh toán</p>

      {loading ? (
        <div className="text-center py-10">Đang tải...</div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-10 text-gray-400">Hiện chưa có chương trình khuyến mãi nào</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vouchers.map((v) => (
            <div
              key={v.code}
              className="border-2 border-dashed border-red-300 rounded-lg p-4 flex justify-between items-center bg-red-50"
            >
              <div>
                <div className="font-bold text-red-600 text-lg">{v.code}</div>
                <div className="text-sm text-gray-700">{v.description}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {v.discountType === 'percent'
                    ? `Giảm ${v.discountValue}%${v.maxDiscountAmount ? ` (tối đa ${formatVND(v.maxDiscountAmount)})` : ''}`
                    : `Giảm ${formatVND(v.discountValue)}`}
                  {v.minOrderValue > 0 && ` — Đơn tối thiểu ${formatVND(v.minOrderValue)}`}
                </div>
              </div>
              <button
                onClick={() => handleCopy(v.code)}
                className="bg-red-600 text-white text-sm px-3 py-1.5 rounded whitespace-nowrap"
              >
                {copiedCode === v.code ? 'Đã sao chép!' : 'Sao chép mã'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
