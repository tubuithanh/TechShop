import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import api from '../../services/api';
import ShipmentTracking, { SHIPMENT_LABELS } from '../ShipmentTracking';
import CarrierProgressForm from './CarrierProgressForm';
import { EvidenceImage } from './OrderReceipt';
import GhnDispatchFields from './GhnDispatchFields';

export default function DeliveryPlanModal({ order, onHide, onChanged }) {
  const [current, setCurrent] = useState(order);
  const [method, setMethod] = useState(order.shipperId ? 'internal' : '');
  const [carrierOptions, setCarrierOptions] = useState([]);
  const [activeProvider, setActiveProvider] = useState('simulation');
  const [ghnForm, setGhnForm] = useState({ provinceId: '', districtId: '', wardCode: '', weight: 500, length: 20, width: 15, height: 10 });
  useEffect(() => {
    api.get(`/deliveries/${order._id}/carriers`).then((r) => {
      setCarrierOptions(r.data.data.options);
      setActiveProvider(r.data.data.activeProvider);
      setMethod((m) => m || r.data.data.defaultMethod);
    }).catch(() => { setCarrierOptions([]); setMethod((m) => m || 'simulation'); });
  }, [order._id]);
  const chosen = carrierOptions.find((o) => o.id === method);
  const [shipperId, setShipperId] = useState(order.shipperId?._id || order.shipperId || '');
  const [shippers, setShippers] = useState([]);
  useEffect(() => { api.get('/deliveries/shippers', { params: { storeId: order.storeId?._id || order.storeId } }).then(r => setShippers(r.data.data)).catch(e => setError(e.response?.data?.message || 'Không tải được nhân viên giao hàng')); }, [order.storeId]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const handleError = e => setError(e.response?.data?.message || 'Không thực hiện được, vui lòng thử lại');
  const run = async (path, body, method = 'post') => {
    if (busy) return; setBusy(true); setError('');
    try { const r = await api[method](`/deliveries/${order._id}/${path}`, body); setCurrent({ ...r.data.data, storeId: order.storeId }); onChanged(); if (path === 'dispatch' || path === 'assign') onHide(); }
    catch (e) { handleError(e); }
    finally { setBusy(false); }
  };
  const shipment = current.shipment || {};
  const next = ({ ready_to_pick: ['picked'], picked: ['transporting'], transporting: ['delivering'], delivering: ['delivered', 'delivery_fail'], delivery_fail: ['delivering', 'returning'], returning: ['returned'] })[shipment.status] || [];
  const locked = ['creating', 'unknown', 'active'].includes(shipment.phase) || !!current.activeTransferId;
  const canReplace = !locked && current.status === 'shipping' && !shippers.some(s => s._id === (current.shipperId?._id || current.shipperId));
  const address = [order.deliveryAddress?.addressLine1, order.deliveryAddress?.addressLine2, order.deliveryAddress?.state, order.deliveryAddress?.city].filter(Boolean).join(', ');
  return <Modal show onHide={busy ? undefined : onHide} size="lg"><Modal.Header closeButton><Modal.Title>Giao hàng — {order.orderCode}</Modal.Title></Modal.Header><Modal.Body>
    {error && <Alert variant="danger">{error}</Alert>}
    <p><strong>{order.storeId?.name}</strong> → {address}</p>
    <ShipmentTracking order={current} onChanged={onChanged} />
    {['carrierPickupProof', 'carrierDeliveryProof'].map(key => current[key]?.evidenceIds?.length > 0 && <div key={key} className="mt-3"><h6>{key === 'carrierPickupProof' ? 'Ảnh nhận hàng' : 'Ảnh giao thành công'}</h6><div className="d-flex flex-wrap gap-2">{current[key].evidenceIds.map(id => <EvidenceImage key={id} orderId={current._id} id={id} />)}</div></div>)}
    {current.status === 'confirmed' && <p className="small text-muted">Có thể phân công trước. Cửa hàng cần chuẩn bị xong hàng trước khi bàn giao.</p>}
    {canReplace && <Form onSubmit={e => { e.preventDefault(); run('assign', { shipperId }, 'put'); }}><Form.Label>Chọn người giao thay (nhân viên cũ không còn hoạt động)</Form.Label><Form.Select required value={shipperId} onChange={e => setShipperId(e.target.value)}><option value="">Chọn nhân viên</option>{shippers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</Form.Select><Button type="submit" className="mt-2" disabled={busy}>Xác nhận</Button></Form>}
    {!locked && ['confirmed', 'processing'].includes(current.status) && <Form onSubmit={e => { e.preventDefault(); run('dispatch', method === 'ghn_sandbox' ? { method, ghn: ghnForm } : { method, shipperId }); }}>
      <Form.Label className="fw-semibold">Chọn cách giao hàng</Form.Label>
      <Form.Select value={method} onChange={e => setMethod(e.target.value)}>
        {carrierOptions.length === 0 && <><option value="internal">Shop tự giao</option><option value="simulation">Đơn vị vận chuyển - giả lập</option></>}
        {carrierOptions.map(o => <option key={o.id} value={o.id} disabled={!o.available}>{o.label}{o.id === activeProvider ? ' (đang dùng)' : ''}{!o.available ? ' - chưa cấu hình' : ''}</option>)}
      </Form.Select>
      {carrierOptions.filter(o => !o.available).map(o => <div key={o.id} className="small text-muted mt-1">{o.label}: {o.reason}</div>)}
      {chosen?.note && <div className="small text-muted mt-1">{chosen.note}</div>}
      {method === 'ghn_sandbox' && current.status !== 'processing' && <Alert variant="warning" className="small py-2 mt-2 mb-0">Chuyển đơn sang "Đang chuẩn bị" (đã đóng gói) trước khi tạo vận đơn GHN.</Alert>}
      {method === 'ghn_sandbox' && <GhnDispatchFields order={current} value={ghnForm} onChange={setGhnForm} />}
      {method === 'internal' && <div className="mt-3"><Form.Label>Nhân viên giao hàng</Form.Label><Form.Select required value={shipperId} onChange={e => setShipperId(e.target.value)}><option value="">Chọn nhân viên của chi nhánh</option>{shippers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</Form.Select>{!shippers.length && <p className="small text-warning mt-2">Chi nhánh chưa có nhân viên giao hàng.</p>}</div>}
      {method === 'simulation' && <p className="small text-muted mt-2">Hệ thống tự tạo mã vận đơn và link theo dõi cho khách.</p>}
      <Button type="submit" className="mt-3" disabled={busy || !method || (method === 'ghn_sandbox' && current.status !== 'processing')}>{busy ? 'Đang xác nhận…' : method === 'ghn_sandbox' ? 'Tạo vận đơn GHN' : 'Xác nhận'}</Button>
    </Form>}
    {current.deliveryPlan?.mode === 'ghn' && (shipment.code || shipment.environment === 'sandbox') && <div className="border-top mt-3 pt-3">
      <h6>{shipment.environment === 'sandbox' ? 'Vận đơn GHN (môi trường test)' : 'Vận chuyển GHN giả lập'}</h6>
      {shipment.environment === 'sandbox'
        ? <Alert variant="info">Vận đơn tạo trên môi trường test của GHN. Trạng thái tự đồng bộ từ GHN mỗi phút; có thể bấm "Đồng bộ ngay".</Alert>
        : <Alert variant="info">Mô phỏng phục vụ kiểm thử, không tạo vận đơn tại GHN thật. Nhân viên cập nhật từng bước giao nhận bên dưới.</Alert>}
      {shipment.error && <Alert variant="warning">{shipment.error}</Alert>}
      {shipment.code && <p className="text-break">Mã: <strong>{shipment.code}</strong> · {SHIPMENT_LABELS[shipment.status] || shipment.status}<br />Phí vận chuyển tham chiếu: {(shipment.totalFee || 0).toLocaleString('vi-VN')}đ · Thu hộ: {(shipment.codAmount || 0).toLocaleString('vi-VN')}đ</p>}
      {activeProvider !== 'ghn_sandbox' && shipment.environment === 'sandbox' && ['confirmed', 'processing'].includes(current.status) && ['creating', 'unknown', 'active', 'failed'].includes(shipment.phase) && <Button variant="outline-warning" disabled={busy} onClick={() => { if (window.confirm('Ngừng theo dõi vận đơn sandbox cũ tại TechShop để tạo vận đơn giả lập? Không gửi lệnh hủy đến GHN.')) run('shipment/retire-sandbox', {}); }}>Chuyển sang giả lập</Button>}
      {shipment.phase === 'active' && <div className="d-flex flex-wrap gap-2">
        {shipment.environment === 'simulation' && next.length > 0 && <CarrierProgressForm key={shipment.code + shipment.status} order={current} next={next} onBusy={setBusy} onSaved={data => { setCurrent({ ...data, storeId: order.storeId }); onChanged(); }} />}
        {shipment.environment === 'simulation' && ['confirmed', 'processing'].includes(current.status) && <Button variant="outline-danger" disabled={busy} onClick={() => { if (window.confirm('Hủy vận đơn giả lập? Đơn bán hàng và tồn kho sẽ giữ nguyên.')) run('shipment/cancel', {}); }}>Hủy vận đơn</Button>}
        {shipment.environment === 'sandbox' && activeProvider === 'ghn_sandbox' && <Button variant="outline-primary" disabled={busy} onClick={() => run('shipment/sync', {})}>Đồng bộ ngay</Button>}
        {shipment.environment === 'sandbox' && activeProvider === 'ghn_sandbox' && shipment.status === 'ready_to_pick' && ['confirmed', 'processing'].includes(current.status) && <Button variant="outline-danger" disabled={busy} onClick={() => { if (window.confirm('Gửi lệnh hủy vận đơn tới GHN (môi trường test)?')) run('shipment/cancel', {}); }}>Hủy vận đơn GHN</Button>}
        {current.status === 'delivered' && shipment.codAmount > 0 && !shipment.codSettledAt && <Button variant="outline-success" disabled={busy} onClick={() => { const reference = window.prompt('Mã đối soát COD giả lập:'); if (reference?.trim()) run('shipment/settle', { reference }); }}>Đối soát COD GHN</Button>}
      </div>}
      {shipment.codSettledAt && <p className="text-success mt-2">Đã đối soát COD GHN · {shipment.codSettlementReference}</p>}
    </div>}
    {current.assignmentLog?.length > 0 && <div className="border-top mt-3 pt-3">
      <h6>Lịch sử phân công</h6>
      <ul className="list-unstyled small mb-0">
        {[...current.assignmentLog].reverse().map((l, i) => (
          <li key={i} className="mb-1">
            <span className="text-muted">{new Date(l.at).toLocaleString('vi-VN')}</span> · <b>{l.byName}</b>{' '}
            {({ assign: 'phân công', reassign: 'đổi phân công sang', unassign: 'gỡ phân công', carrier: 'giao cho đơn vị vận chuyển', carrier_cancel: 'hủy vận đơn' })[l.action] || l.action}{' '}
            {l.shipperName && <b>{l.shipperName}</b>}
            {l.method && l.method !== 'internal' && <> ({({ simulation: 'giả lập', ghn_sandbox: 'GHN sandbox' })[l.method] || l.method})</>}
            {l.carrierCode && <> · <code>{l.carrierCode}</code></>}
            {l.note && <span className="text-muted"> · {l.note}</span>}
          </li>
        ))}
      </ul>
    </div>}
  </Modal.Body><Modal.Footer><Button variant="secondary" disabled={busy} onClick={onHide}>Đóng</Button></Modal.Footer></Modal>;
}
