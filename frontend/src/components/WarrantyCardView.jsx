import { Badge, ProgressBar } from 'react-bootstrap';
import { ShieldCheck, ShieldX, Building, Telephone, BoxArrowUpRight } from 'react-bootstrap-icons';
import ProductImage from './ProductImage';

export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
export const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';

export const CARD_STATE = {
  active: { label: 'Còn bảo hành', bg: 'success' },
  pending_activation: { label: 'Chờ kích hoạt', bg: 'info' },
  expired: { label: 'Hết bảo hành', bg: 'secondary' },
  void: { label: 'Không còn hiệu lực', bg: 'dark' },
  no_warranty: { label: 'Không bảo hành', bg: 'secondary' }
};
export const EXT_STATUS = {
  pending: { label: 'Chờ thanh toán', bg: 'warning' },
  paid: { label: 'Đã thanh toán', bg: 'success' },
  cancelled: { label: 'Đã hủy', bg: 'secondary' }
};

// Hiển thị 1 sổ bảo hành: trạng thái, thời hạn còn lại, ai bảo hành, các gói gia hạn. `actions` = nút thao tác.
export default function WarrantyCardView({ card, actions, showCustomer = false }) {
  const st = CARD_STATE[card.state] || CARD_STATE.active;
  const totalDays = Math.max(1, (new Date(card.endDate) - new Date(card.startDate)) / 86400000);
  const usedPct = Math.min(100, Math.max(0, 100 - (card.daysLeft / totalDays) * 100));
  return (
    <div className="border rounded-3 p-3 bg-body">
      <div className="d-flex gap-3">
        <ProductImage src={card.productImage} alt={card.productName} size={96} className="rounded flex-shrink-0" style={{ width: '4rem' }} />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div style={{ minWidth: 0 }}>
              <div className="fw-semibold text-truncate">{card.productName}{card.variantLabel ? ` (${card.variantLabel})` : ''}</div>
              <div className="small text-muted">
                Mã bảo hành <code>{card.code}</code> · Đơn {card.orderCode}
                {card.serial && <> · IMEI/Serial <code>{card.serial}</code></>}
              </div>
              {showCustomer && <div className="small text-muted">{card.customerName} · {card.customerPhone}</div>}
            </div>
            <Badge bg={st.bg} className="d-inline-flex align-items-center gap-1">
              {card.inWarranty ? <ShieldCheck /> : <ShieldX />} {st.label}
            </Badge>
          </div>

          {card.state !== 'void' && card.totalMonths > 0 && (
            <div className="mt-2">
              <div className="d-flex justify-content-between small">
                <span>{fmtDay(card.startDate)} → <strong>{fmtDay(card.endDate)}</strong></span>
                <span className={card.inWarranty ? 'text-success fw-medium' : 'text-muted'}>
                  {card.inWarranty ? `Còn ${card.daysLeft} ngày` : 'Đã hết hạn'}
                </span>
              </div>
              <ProgressBar now={usedPct} variant={card.daysLeft < 30 ? 'danger' : card.daysLeft < 90 ? 'warning' : 'success'} style={{ height: 5 }} className="my-1" />
              <div className="small text-muted">
                {card.baseMonths} tháng{card.extendedMonths > 0 && <> + <span className="text-success fw-medium">{card.extendedMonths} tháng mua thêm</span></>}
                {' · '}tính từ {card.activatedAt ? `ngày kích hoạt ${fmtDay(card.activatedAt)}` : `ngày mua ${fmtDay(card.purchaseDate)}`}
              </div>
              {card.state === 'pending_activation' && (
                <div className="small text-info mt-1">
                  Sản phẩm bảo hành từ ngày kích hoạt - kích hoạt trước {fmtDay(card.activationDeadline)} (nếu không, bảo hành tính từ ngày mua).
                </div>
              )}
            </div>
          )}
          {card.state === 'void' && <div className="small text-muted mt-2">{card.voidReason}</div>}

          {card.provider === 'manufacturer' && card.providerInfo && (
            <div className="small mt-2 p-2 rounded-2 bg-body-tertiary">
              <div className="fw-medium d-flex align-items-center gap-1"><Building /> Bảo hành do hãng quản lý: {card.providerInfo.name}</div>
              {card.providerInfo.phone && <div><Telephone className="me-1" />{card.providerInfo.phone}</div>}
              {card.providerInfo.address && <div className="text-muted">{card.providerInfo.address}</div>}
              {card.providerInfo.lookupUrl && (
                <a href={card.providerInfo.lookupUrl} target="_blank" rel="noopener noreferrer" className="d-inline-flex align-items-center gap-1">
                  Tra cứu trên trang của hãng <BoxArrowUpRight size={11} />
                </a>
              )}
            </div>
          )}

          {card.extensions?.length > 0 && (
            <div className="small mt-2">
              {card.extensions.map((e) => (
                <div key={e._id} className="d-flex align-items-center gap-2 flex-wrap">
                  <Badge bg={EXT_STATUS[e.status]?.bg || 'secondary'} className="fw-normal">{EXT_STATUS[e.status]?.label || e.status}</Badge>
                  <span>{e.planName} (+{e.months} tháng) · {formatVND(e.price)}</span>
                  {e.status === 'pending' && <span className="text-muted">({e.channel === 'bank_transfer' ? 'chuyển khoản' : 'thanh toán tại cửa hàng'})</span>}
                  {e.extraAction}
                </div>
              ))}
            </div>
          )}
          {actions && <div className="d-flex flex-wrap gap-2 mt-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
