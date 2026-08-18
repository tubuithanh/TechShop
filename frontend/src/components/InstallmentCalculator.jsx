import { useState } from 'react';

function formatVND(value) {
  return Math.round(value).toLocaleString('vi-VN') + 'đ';
}

// Công cụ tính trả góp đơn giản (lãi suất giả định 0% cho một số kỳ hạn, minh họa cho đồ án)
const TERMS = [
  { months: 3, interestRate: 0 },
  { months: 6, interestRate: 0.015 },
  { months: 9, interestRate: 0.02 },
  { months: 12, interestRate: 0.025 }
];

export default function InstallmentCalculator({ price }) {
  const [open, setOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState(TERMS[0]);

  const monthlyPayment = (price * (1 + selectedTerm.interestRate)) / selectedTerm.months;

  return (
    <div className="border rounded-lg p-3 mt-3">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-sm font-medium">
        <span>🧮 Tính toán trả góp 0% - 12 tháng</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2 mb-3">
            {TERMS.map((t) => (
              <button
                key={t.months}
                onClick={() => setSelectedTerm(t)}
                className={`text-xs border rounded px-3 py-1.5 ${
                  selectedTerm.months === t.months ? 'border-red-600 text-red-600' : 'border-gray-300'
                }`}
              >
                {t.months} tháng {t.interestRate === 0 ? '(0%)' : `(${(t.interestRate * 100).toFixed(1)}%/tháng)`}
              </button>
            ))}
          </div>
          <div className="bg-gray-50 rounded p-3 text-sm">
            <div className="flex justify-between">
              <span>Trả trước (dự kiến)</span>
              <span>0đ</span>
            </div>
            <div className="flex justify-between font-bold text-red-600 mt-1">
              <span>Trả góp hàng tháng</span>
              <span>~{formatVND(monthlyPayment)}/tháng</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * Số liệu chỉ mang tính minh họa cho đồ án, chưa bao gồm phí thẩm định của đối tác tài chính thực tế.
          </p>
        </div>
      )}
    </div>
  );
}
