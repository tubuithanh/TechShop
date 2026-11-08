import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Table } from 'react-bootstrap';
import api from '../../services/api';
import { money, orderLabel, orderMethod } from '../../utils/orderWorkflow';
import VatBreakdown from '../VatBreakdown';

function EvidenceImage({ orderId, id }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    let live = true, blobUrl;
    api.get(`/orders/${orderId}/evidence/${id}`, { responseType: 'blob' }).then(r => {
      blobUrl = URL.createObjectURL(r.data); if (live) setUrl(blobUrl); else URL.revokeObjectURL(blobUrl);
    }).catch(() => live && setError('Không tải được ảnh'));
    return () => { live = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [orderId, id]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Bằng chứng bàn giao" style={{ maxWidth: 180, maxHeight: 180 }} /></a> : <span>{error || 'Đang tải ảnh…'}</span>;
}
export default function OrderReceipt({ order: o, onHide }) {
  return <Modal show onHide={onHide} size="lg"><Modal.Header closeButton><Modal.Title>Chi tiết đơn / Phiếu bán hàng</Modal.Title></Modal.Header>
    <Modal.Body className="order-receipt">
      <h4>{o.orderCode}</h4><p>{orderMethod(o)} · {orderLabel(o)}<br />Chi nhánh: {o.storeId?.name || '—'}<br />Ngày lập: {new Date(o.createdAt).toLocaleString('vi-VN')}<br />Khách: {o.deliveryAddress?.fullName} — {o.deliveryAddress?.phone}</p>
            {o.invoiceInfo?.taxCode && (
              <div className="border rounded p-2 mb-2 small">
                <b>Xuất hóa đơn công ty:</b> {o.invoiceInfo.companyName}
                <br />
                MST: {o.invoiceInfo.taxCode} · Địa chỉ: {o.invoiceInfo.address}
                {o.invoiceInfo.email && <> · Email: {o.invoiceInfo.email}</>}
              </div>
            )}
      <p>Người tạo phiếu: {o.createdByName || o.createdBy?.name || (o.source === 'pos' ? o.receipt?.by?.name || 'Chưa có thông tin người tạo' : 'Khách đặt online')}</p>
      <Table size="sm"><thead><tr><th>Sản phẩm</th><th>SL</th><th>Thành tiền</th><th>VAT sau giảm giá</th></tr></thead><tbody>{o.items.map((i,k) => <tr key={k}><td>{i.name} {i.variantLabel}</td><td>{i.quantity}</td><td>{money(i.quantity * i.unitPrice)}</td><td>{i.vat ? <>{i.vat.rate}% · {money(i.vat.amount)}</> : '—'}</td></tr>)}</tbody></Table>
      <p>Tiền hàng: {money(o.itemsTotal)} · Phí giao: {money(o.shippingFee)} · Giảm: {money(o.discountAmount)}<br /><strong>Tổng tiền: {money(o.grandTotal)}</strong><br />Thanh toán: {({ cash: 'Tiền mặt', cod: 'Khi nhận hàng', bank_transfer: 'Chuyển khoản', vnpay: 'VNPay', momo: 'MoMo' })[o.paymentMode]} · {o.paymentStatus === 'paid' ? 'Đã thanh toán' : o.paymentStatus === 'refunded' ? 'Đã hoàn tiền' : 'Chưa thanh toán'}</p>
      <VatBreakdown vat={o.vat} />
      {o.refundStatus === 'pending' && <Alert variant="warning">Đang chờ hoàn tiền thực tế</Alert>}
      {o.receipt?.at && <p>Đã thu {money(o.receipt.amount)} lúc {new Date(o.receipt.at).toLocaleString('vi-VN')} · {({ shipper: 'Shipper thu hộ', counter: 'Thu tại quầy', bank_transfer: 'Chuyển khoản' })[o.receipt.channel]} · Nhân viên: {o.receipt.by?.name || 'Đã ghi nhận'}</p>}
      {o.handover?.at && <p>Người nhận: {o.handover.recipientName}<br />Bàn giao: {new Date(o.handover.at).toLocaleString('vi-VN')} · Nhân viên: {o.handover.by?.name || 'Đã ghi nhận'}<br />Ghi chú: {o.handover.note || '—'}</p>}
      <div className="d-flex flex-wrap gap-2">{o.handover?.evidenceIds?.map(id => <EvidenceImage key={id} orderId={o._id} id={id} />)}</div>
      {o.returnReceivedAt && <p>Kho nhận lại: {new Date(o.returnReceivedAt).toLocaleString('vi-VN')}</p>}
      <h6 className="mt-3">Lịch sử xử lý</h6>{o.statusHistory?.map((h,k) => <div className="small" key={k}>{new Date(h.changedAt).toLocaleString('vi-VN')} · {orderLabel({ ...o, status: h.status })} · {h.note}</div>)}
    </Modal.Body><Modal.Footer><Button variant="secondary" onClick={onHide}>Đóng</Button><Button onClick={() => window.print()}>In phiếu</Button></Modal.Footer>
    <style>{`@media print { body > * { visibility: hidden; } .modal, .modal * { visibility: visible; } .modal { position: absolute; overflow: visible; } .modal-header, .modal-footer, .modal-backdrop { display: none !important; } .modal-dialog { max-width: 100%; margin: 0; } .modal-content { border: 0; } }`}</style>
  </Modal>;
}
