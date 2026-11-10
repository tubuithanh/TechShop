import { ORDER_LABELS } from '../utils/orderWorkflow';
export default function OrderHistory({ order }) {
  return <section className="mt-3">
    {order.confirmedAt && <p className="small">Xác nhận bởi <strong>{order.confirmedByName || 'Nhân viên'}</strong> · {order.confirmedStoreName} · {new Date(order.confirmedAt).toLocaleString('vi-VN')}</p>}
    <h6>Lịch sử xử lý</h6>
    {order.statusHistory?.map((h, i) => <div className="small border-bottom py-2" key={h._id || i}>
      {new Date(h.changedAt).toLocaleString('vi-VN')} · {ORDER_LABELS[h.status] || h.status} · {h.actorName || (h.changedBy ? 'Tài khoản đã được ghi nhận (dữ liệu cũ)' : 'Hệ thống')}{h.storeName && ` · ${h.storeName}`}
      <div>{h.note}</div>
      {h.changes && Object.entries(h.changes).map(([field, change]) => <div className="text-muted" key={field}>{({ note: 'Ghi chú', 'deliveryAddress.fullName': 'Người nhận', 'deliveryAddress.phone': 'Điện thoại', 'deliveryAddress.addressLine1': 'Địa chỉ', 'deliveryAddress.city': 'Tỉnh/thành', storeId: 'Chi nhánh', status: 'Trạng thái' })[field] || field}: {ORDER_LABELS[change.from] || String(change.from ?? '—')} → {ORDER_LABELS[change.to] || String(change.to ?? '—')}</div>)}
    </div>)}
  </section>;
}
