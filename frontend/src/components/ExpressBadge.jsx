import { useEffect, useState } from 'react';
import { LightningChargeFill, Truck } from 'react-bootstrap-icons';
import api from '../services/api';

let cache = null; // dùng chung trong phiên: danh sách khung giờ hỏa tốc đang mở (làm mới sau 60 giây)
const loadActive = () => {
  if (!cache || Date.now() - cache.at > 60000) cache = { at: Date.now(), p: api.get('/express/active').then((r) => r.data.data).catch(() => []) };
  return cache.p;
};

// Trang sản phẩm: sản phẩm đang trong khung giờ hỏa tốc -> "⚡ Giao hỏa tốc 2 giờ từ <chi nhánh>"; không thì giao tiêu chuẩn
export default function ExpressBadge({ productId }) {
  const [windows, setWindows] = useState([]);
  useEffect(() => { let live = true; loadActive().then((list) => live && setWindows(list.filter((w) => w.productIds.some((id) => String(id) === String(productId))))); return () => { live = false; }; }, [productId]);
  if (!windows.length) return <div><Truck className="text-primary" /> Giao tiêu chuẩn 1 - 3 ngày toàn quốc</div>;
  const w = windows[0];
  const until = new Date(w.endAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="express-badge">
      <LightningChargeFill className="text-warning" /> <b>Giao hỏa tốc {w.slaMinutes / 60} giờ</b> (+{(w.fee || 0).toLocaleString('vi-VN')}đ)
      <span className="d-block small text-muted">
        Từ {windows.map((x) => x.store?.name).filter(Boolean).join(', ')} · bán kính {w.radiusKm} km · đặt trước {until} hôm nay
        {w.slotsLeft != null && w.slotsLeft <= 5 && <span className="text-danger"> · chỉ còn {w.slotsLeft} suất</span>}
      </span>
    </div>
  );
}
