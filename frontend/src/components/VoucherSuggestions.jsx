import { Badge } from 'react-bootstrap';
import { TicketPerforated, CheckCircleFill } from 'react-bootstrap-icons';

const vnd = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const describe = (v) => v.description || (v.discountType === 'percent'
  ? `Giảm ${v.discountValue}%${v.maxDiscountAmount ? ` tối đa ${vnd(v.maxDiscountAmount)}` : ''}`
  : `Giảm ${vnd(v.discountValue)}`);

// Gợi ý TOP 3 mã giảm giá có lợi nhất (đã tính số tiền giảm cho giỏ hiện tại) + gợi ý "mua thêm để dùng mã".
// offers: kết quả /vouchers/suggest; applied: mã đang áp dụng; onPick(code | '') chọn / bỏ mã
export default function VoucherSuggestions({ offers, applied, onPick }) {
  if (!offers || (!offers.eligible.length && !offers.nearly.length)) return null;
  return (
    <div className="voucher-suggest mb-3">
      <div className="small fw-semibold mb-1">
        <TicketPerforated className="text-danger me-1" />Mã giảm giá dành cho bạn
        {offers.total > offers.eligible.length && <span className="text-muted fw-normal"> · {offers.eligible.length} mã lợi nhất / {offers.total} mã</span>}
      </div>
      {offers.eligible.map((v, i) => {
        const on = applied === v.code;
        return (
          <button key={v.code} type="button" onClick={() => onPick(on ? '' : v.code)} className={`voucher-suggest-item ${on ? 'active' : ''}`} aria-pressed={on}>
            <span className="flex-grow-1 text-start" style={{ minWidth: 0 }}>
              <span className="d-block small fw-bold">
                {v.code}
                {i === 0 && <Badge bg="danger" className="ms-1 fw-normal">Tốt nhất</Badge>}
                {v.forTier && <Badge bg="warning" text="dark" className="ms-1 fw-normal">Hạng thành viên</Badge>}
                {v.remaining != null && v.remaining <= 10 && <Badge bg="dark" className="ms-1 fw-normal">Còn {v.remaining} lượt</Badge>}
              </span>
              <span className="d-block text-muted text-truncate" style={{ fontSize: '0.75rem' }}>
                {describe(v)}{v.limited ? ' · áp dụng một số sản phẩm' : ''} · HSD {new Date(v.endDate).toLocaleDateString('vi-VN')}
              </span>
            </span>
            <span className="text-end flex-shrink-0">
              <span className="d-block fw-bold text-success small">−{vnd(v.amount)}</span>
              <span className="d-block" style={{ fontSize: '0.72rem' }}>
                {on ? <span className="text-success"><CheckCircleFill className="me-1" />Đang dùng</span> : <span className="text-primary">Áp dụng</span>}
              </span>
            </span>
          </button>
        );
      })}
      {offers.nearly.map((v) => (
        <div key={v.code} className="small text-muted mt-1">
          💡 Mua thêm <b className="text-danger">{vnd(v.missing)}</b> để dùng mã <b>{v.code}</b> ({describe(v).toLowerCase()})
        </div>
      ))}
    </div>
  );
}
