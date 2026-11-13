import { useEffect, useState } from 'react';
import { Badge } from 'react-bootstrap';
import { CreditCard2FrontFill, Wallet2, CashCoin } from 'react-bootstrap-icons';
import VnpaySettingsPanel from './VnpaySettingsPanel';
import MomoSettingsPanel from './MomoSettingsPanel';
import { paymentService } from '../../services/paymentService';

// Danh sách cổng thanh toán online cấu hình được. Thêm cổng mới (VD: ZaloPay): thêm 1 phần tử + 1 panel cấu hình.
const GATEWAYS = [
  { key: 'vnpay', label: 'VNPay', icon: CreditCard2FrontFill, Panel: VnpaySettingsPanel, desc: 'Thẻ ATM nội địa, thẻ quốc tế, QR ngân hàng' },
  { key: 'momo', label: 'MoMo', icon: Wallet2, Panel: MomoSettingsPanel, desc: 'Ví điện tử MoMo' }
];

// Cấu hình hệ thống -> Thanh toán: gom mọi cổng thanh toán vào 1 tab. Chọn cổng ở thanh trên để cấu hình.
// ?tab=payment&gateway=momo mở thẳng cổng MoMo (link cũ ?tab=momo cũng được chuyển về đây).
export default function PaymentSettingsPanel({ initialGateway }) {
  const [gateway, setGateway] = useState(GATEWAYS.some((g) => g.key === initialGateway) ? initialGateway : 'vnpay');
  const [status, setStatus] = useState(null); // { vnpay: bool, momo: bool } - cổng nào đang dùng được ở trang thanh toán

  const loadStatus = () => paymentService.getMethods().then(setStatus).catch(() => setStatus(null));
  useEffect(() => { loadStatus(); }, []);

  const choose = (key) => {
    setGateway(key);
    // Giữ lựa chọn trên địa chỉ trang để tải lại / chia sẻ link vẫn mở đúng cổng
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'payment');
    url.searchParams.set('gateway', key);
    window.history.replaceState(null, '', url);
    loadStatus();
  };
  const Current = GATEWAYS.find((g) => g.key === gateway).Panel;

  return (
    <div>
      <h3 className="fs-6 fw-bold mb-1 border-start border-4 border-primary ps-2">Thanh toán</h3>
      <p className="small text-muted mb-3">
        Các hình thức khách dùng ở trang thanh toán. COD, tiền mặt tại quầy và chuyển khoản luôn có sẵn; cổng thanh toán online
        hiện cho khách khi đã cấu hình và đang bật.
      </p>

      <div className="d-flex flex-wrap gap-2 mb-2">
        <span className="d-inline-flex align-items-center gap-2 border rounded-3 px-3 py-2 small bg-body-tertiary">
          <CashCoin className="text-success" /> COD · Tiền mặt · Chuyển khoản <Badge bg="success" className="fw-normal">Luôn bật</Badge>
        </span>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Chọn cổng thanh toán">
        {GATEWAYS.map((g) => {
          const on = status?.[g.key];
          const activeTab = gateway === g.key;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={activeTab}
              onClick={() => choose(g.key)}
              className={`text-start border rounded-3 px-3 py-2 bg-body ${activeTab ? 'border-primary border-2 shadow-sm' : ''}`}
              style={{ minWidth: 220 }}
            >
              <div className="d-flex align-items-center justify-content-between gap-2">
                <span className="fw-semibold d-inline-flex align-items-center gap-2"><g.icon className="text-primary" /> {g.label}</span>
                {status && <Badge bg={on ? 'success' : 'secondary'} className="fw-normal">{on ? 'Đang bật' : 'Chưa bật'}</Badge>}
              </div>
              <div className="small text-muted">{g.desc}</div>
            </button>
          );
        })}
      </div>

      <Current key={gateway} />
    </div>
  );
}
