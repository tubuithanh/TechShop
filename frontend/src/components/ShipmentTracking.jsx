import { useState } from 'react';
import { Alert, Badge, Button, Modal } from 'react-bootstrap';
import api from '../services/api';
import { Truck, BoxArrowUpRight } from 'react-bootstrap-icons';
export const SHIPMENT_LABELS = { ready_to_pick: 'Chờ GHN lấy hàng', picking: 'GHN đang đến lấy', picked: 'Đã lấy hàng', storing: 'Tại kho GHN', transporting: 'Đang vận chuyển', sorting: 'Đang phân loại', delivering: 'Đang giao cho khách', delivery_fail: 'Giao chưa thành công', delivered: 'Đã giao', waiting_to_return: 'Chờ chuyển hoàn', return: 'Chuyển hoàn', return_transporting: 'Đang vận chuyển hoàn', return_sorting: 'Phân loại hàng hoàn', returning: 'Đang trả về cửa hàng', return_fail: 'Trả hàng chưa thành công', returned: 'Đã trả về cửa hàng', cancel: 'Đã hủy vận đơn' };
export const deliveryModeLabel = p => ({ internal: 'Nhân viên chi nhánh', express: 'Hỏa tốc', ghn: 'GHN giả lập' })[p?.mode] || 'Chưa xác minh tuyến giao';
export default function ShipmentTracking({ order, onChanged }) {
  const [show, setShow] = useState(false), [shipment, setShipment] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    setShow(true); setBusy(true); setError('');
    try { const r = await api.get(`/deliveries/${order._id}/tracking`, { params: { refresh: true } }); setShipment(r.data.data.shipment); onChanged?.(); }
    catch (e) { setError(e.response?.data?.message || 'Chưa cập nhật được GHN'); }
    finally { setBusy(false); }
  };
  const data = shipment || order.shipment;
  return <div className="small mt-2">
    {!order.shipment?.code && order.deliveryPlan?.mode && <div><Badge bg={order.deliveryPlan.mode === 'express' ? 'danger' : 'info'}>{deliveryModeLabel(order.deliveryPlan)}</Badge></div>}
    {order.shipment?.code && (order.shipment.environment === 'simulation'
      ? <section className="border rounded-3 p-3 bg-white" aria-label="Thông tin vận chuyển">
          <div className="d-flex align-items-center gap-3">
            <div className="rounded-3 bg-light d-flex align-items-center justify-content-center flex-shrink-0" style={{width:44,height:44}}><Truck size={23} aria-hidden="true" /></div>
            <div className="flex-grow-1" style={{minWidth:0}}>
              <div className="d-flex align-items-center flex-wrap gap-2"><strong className="text-dark">Giao Hàng Nhanh</strong><span className="badge bg-light text-secondary border fw-normal">Giả lập</span></div>
              <div className={`mt-1 ${order.shipment.status === 'delivered' ? 'text-success' : 'text-muted'}`}>{SHIPMENT_LABELS[order.shipment.status] || 'Đang cập nhật vận chuyển'}</div>
            </div>
          </div>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top pt-3 mt-3">
            <div className="text-muted">Cập nhật hành trình và ảnh giao nhận</div>
            <a className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2" href={`/van-chuyen/${encodeURIComponent(order.shipment.code)}`} target="_blank" rel="noopener noreferrer" aria-label={`Theo dõi vận chuyển đơn ${order.orderCode}, mở tab mới`}>Theo dõi vận chuyển <BoxArrowUpRight size={13} aria-hidden="true" /></a>
          </div>
        </section>
      : <Button variant="link" size="sm" className="px-0" onClick={load}>Vận đơn sandbox cũ: {order.shipment.code}</Button>)}
    <Modal show={show} onHide={() => setShow(false)}><Modal.Header closeButton><Modal.Title>Theo dõi GHN</Modal.Title></Modal.Header><Modal.Body>
      <Alert variant="info">Vận đơn thử nghiệm sandbox — không có giao nhận hàng thật.</Alert>
      {error && <Alert variant="danger">{error}</Alert>}
      <p>Đơn {order.orderCode} · Mã vận đơn <strong>{data?.code}</strong></p>
      <p>{SHIPMENT_LABELS[data?.status] || data?.status}</p>
      {data?.expectedDeliveryTime && <p>Dự kiến: {new Date(data.expectedDeliveryTime).toLocaleString('vi-VN')}</p>}
      {data?.events?.map((e,i) => <div className="border-bottom py-2" key={i}>{new Date(e.at).toLocaleString('vi-VN')} · {SHIPMENT_LABELS[e.status] || e.status}</div>)}
    </Modal.Body><Modal.Footer><Button disabled={busy} onClick={load}>{busy ? 'Đang cập nhật…' : 'Cập nhật từ GHN'}</Button></Modal.Footer></Modal>
  </div>;
}
