import { useState } from 'react';
import { ORDER_LABELS } from '../utils/orderWorkflow';

export default function OrderHistory({ order, compact = false }) {
  const initial = compact ? 3 : 10;
  const [count, setCount] = useState(initial);
  const history = [...(order.statusHistory || [])].filter(h => !compact || h.eventType !== 'activity').sort((a,b) => new Date(b.changedAt) - new Date(a.changedAt));
  return <section className="mt-3 order-history">
    <div className="d-flex justify-content-between align-items-center mb-2"><h6 className="mb-0">{compact ? 'Tiến trình đơn hàng' : 'Lịch sử xử lý'}</h6><span className="small text-muted">{history.length} cập nhật</span></div>
    {!history.length && <p className="small text-muted">Chưa có cập nhật.</p>}
    <ol className="list-unstyled mb-0 border-start ms-1 ps-3">
      {history.slice(0, count).map((h, i) => <li className="py-2 border-bottom small" key={h._id || i}>
        <div className="d-flex flex-wrap justify-content-between gap-1"><strong>{h.status === 'delivered' && order.deliveryMethod === 'home_delivery' ? 'Đã giao hàng' : ORDER_LABELS[h.status] || h.status}</strong><time className="text-muted">{new Date(h.changedAt).toLocaleString('vi-VN')}</time></div>
        {!compact && <><div className="text-muted">{h.actorName || 'Hệ thống'}{h.storeName && ` · ${h.storeName}`}</div>
          <details className="mt-1"><summary>Chi tiết thao tác</summary><div className="text-break mt-1" style={{whiteSpace:'pre-wrap'}}>{h.note || 'Không có ghi chú'}</div>
            {h.changes && Object.entries(h.changes).map(([field, change]) => <div className="text-muted text-break" key={field}>{({note:'Ghi chú','deliveryAddress.fullName':'Người nhận','deliveryAddress.phone':'Điện thoại','deliveryAddress.addressLine1':'Địa chỉ','deliveryAddress.city':'Tỉnh/thành',storeId:'Chi nhánh',status:'Trạng thái'})[field] || field}: {ORDER_LABELS[change.from] || String(change.from ?? '—')} → {ORDER_LABELS[change.to] || String(change.to ?? '—')}</div>)}
          </details></>}
      </li>)}
    </ol>
    <div className="d-flex gap-3 mt-2">
      {count < history.length && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setCount(n => n + 5)}>Xem thêm ({history.length - count})</button>}
      {count > initial && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setCount(initial)}>Thu gọn</button>}
    </div>
    <style>{`@media print { .order-history { display: none !important; } }`}</style>
  </section>;
}
