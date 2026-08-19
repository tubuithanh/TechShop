import { useState } from 'react';
import { Card, Button } from 'react-bootstrap';

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
    <Card className="mt-3">
      <Card.Body className="p-3">
        <Button
          variant="link"
          onClick={() => setOpen(!open)}
          className="d-flex align-items-center justify-content-between w-100 small fw-medium p-0 text-dark text-decoration-none"
        >
          <span>🧮 Tính toán trả góp 3 - 12 tháng</span>
          <span>{open ? '▲' : '▼'}</span>
        </Button>
        {open && (
          <div className="mt-3">
            <div className="d-flex flex-wrap gap-2 mb-3">
              {TERMS.map((t) => (
                <Button
                  key={t.months}
                  size="sm"
                  variant={selectedTerm.months === t.months ? 'outline-primary' : 'outline-secondary'}
                  onClick={() => setSelectedTerm(t)}
                  className="small"
                >
                  {t.months} tháng {t.interestRate === 0 ? '(0%)' : `(${(t.interestRate * 100).toFixed(1)}%/tháng)`}
                </Button>
              ))}
            </div>
            <div className="bg-light rounded p-3 small">
              <div className="d-flex justify-content-between">
                <span>Trả trước (dự kiến)</span>
                <span>0đ</span>
              </div>
              <div className="d-flex justify-content-between fw-bold text-primary mt-1">
                <span>Trả góp hàng tháng</span>
                <span>~{formatVND(monthlyPayment)}/tháng</span>
              </div>
            </div>
            <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.75rem' }}>
              * Số liệu chỉ mang tính minh họa cho đồ án, chưa bao gồm phí thẩm định của đối tác tài chính thực tế.
            </p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
