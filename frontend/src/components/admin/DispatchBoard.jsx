import { Badge, ProgressBar } from 'react-bootstrap';
import { StarFill, Cash, LightningChargeFill, GeoAlt, CheckCircle, XCircle, Truck, Clock, PersonX, Speedometer } from 'react-bootstrap-icons';
import AdminThumb from './AdminThumb';

const money = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const short = (v) => (v >= 1e6 ? `${Math.round(v / 1e5) / 10} tr` : money(v));
const mins = (m) => (m < 60 ? `${m} phút` : m < 1440 ? `${Math.floor(m / 60)} giờ ${m % 60 ? `${m % 60}p` : ''}` : `${Math.floor(m / 1440)} ngày`);
const STATUS = { free: ['Rảnh', 'success'], busy: ['Đang bận', 'warning'], overloaded: ['Quá tải', 'danger'] };

// Dải chỉ số điều phối hôm nay
export function DispatchKpis({ summary, onPick }) {
  const items = [
    ['pending', 'Chưa phân công', summary.pending, summary.pending ? `chờ lâu nhất ${mins(summary.oldestPendingMinutes)}` : 'đã phân công hết', summary.pending ? 'danger' : 'success', PersonX],
    ['express', 'Hỏa tốc chờ / trễ', `${summary.expressPending} / ${summary.lateExpress}`, summary.lateExpress ? 'có đơn trễ hạn!' : 'đúng hạn', summary.lateExpress ? 'danger' : 'warning', LightningChargeFill],
    ['shipping', 'Đang giao', summary.shipping, `${summary.free} shipper rảnh · ${summary.overloaded} quá tải`, 'primary', Truck],
    [null, 'Giao xong hôm nay', summary.deliveredToday, summary.failedToday ? `${summary.failedToday} lần giao lỗi` : 'chưa có giao lỗi', 'success', CheckCircle],
    ['cod', 'COD shipper đang giữ', short(summary.codHeldAmount), 'chờ nộp về chi nhánh', 'secondary', Cash]
  ];
  return (
    <div className="dispatch-kpis mb-3">
      {items.map(([key, label, value, sub, tone, Icon]) => (
        <button key={label} type="button" className={`dispatch-kpi border-${tone}`} onClick={() => key && onPick?.(key)} disabled={!key}>
          <span className={`dispatch-kpi-icon text-${tone}`}><Icon /></span>
          <span className="text-start">
            <span className="d-block small text-muted">{label}</span>
            <span className="d-block fs-5 fw-bold lh-sm">{value}</span>
            <span className={`d-block text-${tone === 'danger' ? 'danger' : 'muted'}`} style={{ fontSize: '0.72rem' }}>{sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Thẻ từng shipper: tải công việc, khu vực đang giao, hôm nay, COD đang giữ, điểm khách chấm. Bấm để lọc đơn của người đó.
export function ShipperCards({ shippers, cap, selected, onSelect }) {
  if (!shippers.length) return <div className="alert alert-warning py-2 small">Chi nhánh chưa có nhân viên giao hàng (cần quyền "Giao hàng" và gắn chi nhánh).</div>;
  return (
    <div className="shipper-strip mb-3">
      {shippers.map((s) => {
        const [label, tone] = STATUS[s.status];
        const on = selected === String(s._id);
        return (
          <button key={s._id} type="button" className={`shipper-card ${on ? 'active' : ''}`} onClick={() => onSelect(on ? '' : String(s._id))} title="Bấm để xem đơn của nhân viên này">
            <div className="d-flex align-items-center gap-2">
              <span className="position-relative"><AdminThumb src={s.avatar} name={s.name} size={34} rounded /><span className={`shipper-dot bg-${tone}`} /></span>
              <span className="text-start flex-grow-1 min-w-0">
                <span className="d-block fw-semibold small text-truncate">{s.name}</span>
                <Badge bg={`${tone}-subtle`} text={`${tone}-emphasis`} className="fw-normal">{label}</Badge>
                {s.rating != null && <span className="small ms-1"><StarFill className="text-warning" size={10} /> {s.rating}</span>}
              </span>
            </div>
            <div className="d-flex justify-content-between small mt-2"><span>Đang giữ <b>{s.load}</b>/{cap}</span><span className="text-muted">{s.waiting} chờ lấy · {s.shipping} đang giao</span></div>
            <ProgressBar now={Math.min(100, (s.load / cap) * 100)} variant={tone} style={{ height: 5 }} />
            <div className="d-flex flex-wrap gap-2 mt-2" style={{ fontSize: '0.72rem' }}>
              <span className="text-success"><CheckCircle /> {s.deliveredToday} hôm nay</span>
              {s.failedToday > 0 && <span className="text-danger"><XCircle /> {s.failedToday} lỗi</span>}
              {s.express > 0 && <span className={s.lateExpress ? 'text-danger fw-semibold' : 'text-warning'}><LightningChargeFill /> {s.express} hỏa tốc{s.lateExpress ? ` (${s.lateExpress} trễ)` : ''}</span>}
              {s.codHeldAmount > 0 && <span className="text-muted"><Cash /> {short(s.codHeldAmount)}</span>}
            </div>
            {s.areas.length > 0 && <div className="text-muted text-truncate mt-1" style={{ fontSize: '0.72rem' }}><GeoAlt /> {s.areas.slice(0, 2).map((a) => `${a.area} (${a.n})`).join(' · ')}</div>}
          </button>
        );
      })}
    </div>
  );
}

// Khu vực đang có đơn chờ phân công (gom đơn cùng khu để giao 1 chuyến)
export function PendingAreas({ areas, onPick }) {
  if (!areas.length) return null;
  return (
    <div className="d-flex flex-wrap align-items-center gap-1 mb-2 small">
      <span className="text-muted"><Speedometer className="me-1" />Khu vực chờ giao:</span>
      {areas.slice(0, 8).map((a) => <button key={a.area} type="button" className="btn btn-sm btn-outline-secondary rounded-pill py-0" onClick={() => onPick(a.area.split(',')[0])}>{a.area} <b>{a.n}</b></button>)}
    </div>
  );
}

// GỢI Ý NGƯỜI GIAO cho 1 đơn: ưu tiên người đang giao cùng khu vực mà chưa quá tải, rồi người rảnh nhất, điểm cao hơn.
// planned: số đơn đã dự định giao thêm cho từng người trong lần "tự phân công" (để chia đều)
export function suggestShipper(order, shippers, cap, planned = {}) {
  const area = [order.deliveryAddress?.addressLine2, order.deliveryAddress?.city].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const ward = String(order.deliveryAddress?.addressLine2 || '').trim();
  const storeId = String(order.storeId?._id || order.storeId || '');
  const candidates = shippers.filter((s) => !s.storeId || !storeId || String(s.storeId) === storeId);
  let best = null;
  for (const s of candidates) {
    const load = s.load + (planned[s._id] || 0);
    if (load >= cap) continue;
    const sameArea = ward && s.areas.some((a) => a.area === area || a.area.startsWith(ward));
    const score = (sameArea ? 100 : 0) - load * 10 + (s.rating || 4) * 2 - (s.lateExpress ? 15 : 0);
    if (!best || score > best.score) best = { shipper: s, score, reason: sameArea ? `đang giao cùng khu ${ward}` : load === 0 ? 'đang rảnh' : `ít đơn nhất (${load})` };
  }
  return best;
}

export { mins };
