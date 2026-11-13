import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, ProgressBar, Collapse } from 'react-bootstrap';
import { TelephoneFill, GeoAltFill, Map, LightningChargeFill, Clock, Cash, Truck, Shop, Boxes, StarFill, CheckCircleFill, Lightbulb, ClockHistory } from 'react-bootstrap-icons';
import AdminThumb from './AdminThumb';
import { suggestShipper } from './DispatchBoard';
import api from '../../services/api';
import ShipmentTracking, { SHIPMENT_LABELS } from '../ShipmentTracking';
import CarrierProgressForm from './CarrierProgressForm';
import { EvidenceImage } from './OrderReceipt';
import GhnDispatchFields from './GhnDispatchFields';

const money = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const waited = (o) => {
  const t = (o.statusHistory || []).reduce((m, h) => (h.changedAt && new Date(h.changedAt) > m ? new Date(h.changedAt) : m), new Date(o.createdAt || 0));
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `${m} phút` : m < 1440 ? `${Math.floor(m / 60)} giờ` : `${Math.floor(m / 1440)} ngày`;
};
const METHOD_INFO = {
  internal: { icon: Shop, title: 'Shop tự giao', desc: 'Nhân viên giao hàng của chi nhánh · trong 20 km, cùng tỉnh' },
  simulation: { icon: Truck, title: 'Đơn vị vận chuyển (giả lập)', desc: 'Tự tạo mã vận đơn + link theo dõi cho khách' },
  ghn_sandbox: { icon: Boxes, title: 'Giao Hàng Nhanh (GHN)', desc: 'Tạo vận đơn GHN môi trường test · xa / khác tỉnh' }
};
const LOAD_TONE = { free: 'success', busy: 'warning', overloaded: 'danger' };

export default function DeliveryPlanModal({ order, onHide, onChanged, board: boardProp }) {
  const [board, setBoard] = useState(boardProp || null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => { if (!boardProp) api.get('/deliveries/board', { params: { storeId: order.storeId?._id || order.storeId } }).then((r) => setBoard(r.data.data)).catch(() => {}); }, [boardProp, order.storeId]);
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
  // Xếp hạng shipper cho đơn này: cùng khu vực + ít việc + điểm cao (dùng chung thuật toán với bảng điều phối)
  const ranked = useMemo(() => {
    const list = shippers.map((sh) => {
      const info = board?.shippers.find((b) => String(b._id) === String(sh._id)) || { _id: sh._id, name: sh.name, load: 0, areas: [], status: 'free', storeId: sh.storeId };
      return { ...sh, info };
    });
    const best = board ? suggestShipper(order, list.map((x) => x.info), board.cap) : null;
    const ward = String(order.deliveryAddress?.addressLine2 || '').trim();
    return list.map((x) => ({ ...x, recommended: best && String(best.shipper._id) === String(x._id), reason: best && String(best.shipper._id) === String(x._id) ? best.reason : '',
      sameArea: ward && x.info.areas?.some((a) => a.area.startsWith(ward)) }))
      .sort((a, b) => (b.recommended - a.recommended) || (b.sameArea - a.sameArea) || (a.info.load - b.info.load));
  }, [shippers, board, order]);
  useEffect(() => { if (!shipperId && ranked[0]?.recommended) setShipperId(String(ranked[0]._id)); }, [ranked]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className="plan-summary mb-3">
      <div className="d-flex flex-wrap gap-3 align-items-start">
        <div className="flex-grow-1 min-w-0">
          <div className="fw-semibold">{order.deliveryAddress?.fullName}
            {order.deliveryAddress?.phone && <a className="ms-2 small text-decoration-none" href={`tel:${order.deliveryAddress.phone}`}><TelephoneFill className="me-1" />{order.deliveryAddress.phone}</a>}
          </div>
          <div className="small text-muted"><GeoAltFill className="me-1 text-danger" />{address}</div>
          <div className="small text-muted"><Shop className="me-1" />Từ {order.storeId?.name}
            {current.deliveryPlan?.distanceMeters != null && <> · <b>{(current.deliveryPlan.distanceMeters / 1000).toFixed(1)} km</b> đường bộ</>}
            <a className="ms-2" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent([order.storeId?.address, order.storeId?.city].filter(Boolean).join(', ') || order.storeId?.name || '')}&destination=${encodeURIComponent(address)}`}><Map className="me-1" />Xem đường đi</a>
          </div>
        </div>
        <div className="text-end small">
          <div className="fs-5 fw-bold">{money(order.grandTotal)}</div>
          {order.paymentMode === 'cod' ? <Badge bg="warning" text="dark"><Cash className="me-1" />Thu hộ COD</Badge> : <Badge bg="success">Đã thanh toán</Badge>}
          <div className="text-muted mt-1">{(order.items || []).reduce((n, i) => n + i.quantity, 0)} sản phẩm</div>
        </div>
      </div>
      <div className="d-flex flex-wrap gap-2 mt-2 small">
        {order.express?.deadline && (() => { const m = Math.round((new Date(order.express.deadline) - Date.now()) / 60000); return <Badge bg={m < 0 ? 'dark' : m <= 30 ? 'danger' : 'warning'} text={m > 30 ? 'dark' : undefined}><LightningChargeFill className="me-1" />Hỏa tốc · {m < 0 ? `trễ ${-m} phút` : `còn ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`}</Badge>; })()}
        {['confirmed', 'processing'].includes(current.status) && !current.shipperId && <Badge bg="danger-subtle" text="danger-emphasis"><Clock className="me-1" />Chờ phân công {waited(current)}</Badge>}
        {current.status === 'confirmed' && <Badge bg="info-subtle" text="info-emphasis">Kho đang chuẩn bị hàng - có thể phân công trước</Badge>}
        {order.note && <Badge bg="light" text="dark" className="border fw-normal text-wrap text-start">📝 {order.note}</Badge>}
      </div>
      {(order.items || []).length > 0 && <div className="small text-muted mt-2 text-truncate">{order.items.map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} x${i.quantity}`).join(' · ')}</div>}
    </div>
    <ShipmentTracking order={current} onChanged={onChanged} />
    {['carrierPickupProof', 'carrierDeliveryProof'].map(key => current[key]?.evidenceIds?.length > 0 && <div key={key} className="mt-3"><h6>{key === 'carrierPickupProof' ? 'Ảnh nhận hàng' : 'Ảnh giao thành công'}</h6><div className="d-flex flex-wrap gap-2">{current[key].evidenceIds.map(id => <EvidenceImage key={id} orderId={current._id} id={id} />)}</div></div>)}
    {canReplace && <Form onSubmit={e => { e.preventDefault(); run('assign', { shipperId }, 'put'); }}><Form.Label>Chọn người giao thay (nhân viên cũ không còn hoạt động)</Form.Label><Form.Select required value={shipperId} onChange={e => setShipperId(e.target.value)}><option value="">Chọn nhân viên</option>{shippers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</Form.Select><Button type="submit" className="mt-2" disabled={busy}>Xác nhận</Button></Form>}
    {!locked && ['confirmed', 'processing'].includes(current.status) && <Form onSubmit={e => { e.preventDefault(); run('dispatch', method === 'ghn_sandbox' ? { method, ghn: ghnForm } : { method, shipperId }); }}>
      <Form.Label className="fw-semibold">1. Chọn cách giao</Form.Label>
      <div className="plan-methods">
        {(carrierOptions.length ? carrierOptions : [{ id: 'internal', label: 'Shop tự giao', available: true }, { id: 'simulation', label: 'Đơn vị vận chuyển - giả lập', available: true }]).map((o) => {
          const info = METHOD_INFO[o.id] || { icon: Truck, title: o.label, desc: '' };
          const Icon = info.icon;
          const recommended = order.express?.deadline ? o.id === 'internal' : o.id === (current.shipperId ? 'internal' : carrierOptions.length ? (shippers.length ? 'internal' : activeProvider) : 'internal');
          return (
            <button key={o.id} type="button" disabled={!o.available} onClick={() => setMethod(o.id)} className={`plan-method ${method === o.id ? 'active' : ''}`}>
              <Icon size={20} className="mb-1" />
              <span className="d-block fw-semibold small">{info.title}{recommended && o.available && <Badge bg="success" className="ms-1 fw-normal">Đề xuất</Badge>}</span>
              <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>{o.available ? info.desc : o.reason || 'Chưa cấu hình'}</span>
              {o.id === activeProvider && o.id !== 'internal' && <span className="d-block text-primary" style={{ fontSize: '0.7rem' }}>Đơn vị đang dùng</span>}
            </button>
          );
        })}
      </div>
      {order.express?.deadline && method !== 'internal' && <Alert variant="warning" className="small py-2 mt-2 mb-0">Đơn hỏa tốc nên do shipper của chi nhánh giao để kịp hạn.</Alert>}
      {chosen?.note && <div className="small text-muted mt-1">{chosen.note}</div>}
      {method === 'ghn_sandbox' && current.status !== 'processing' && <Alert variant="warning" className="small py-2 mt-2 mb-0">Chuyển đơn sang "Đang chuẩn bị" (đã đóng gói) trước khi tạo vận đơn GHN.</Alert>}
      {method === 'ghn_sandbox' && <GhnDispatchFields order={current} value={ghnForm} onChange={setGhnForm} />}
      {method === 'internal' && <div className="mt-3">
        <Form.Label className="fw-semibold">2. Chọn nhân viên giao hàng</Form.Label>
        {!shippers.length && <Alert variant="warning" className="small py-2">Chi nhánh chưa có nhân viên giao hàng - hãy chọn đơn vị vận chuyển.</Alert>}
        <div className="plan-shippers">
          {ranked.map((x) => {
            const on = String(shipperId) === String(x._id);
            const tone = LOAD_TONE[x.info.status] || 'secondary';
            const cap = board?.cap || 8;
            return (
              <button key={x._id} type="button" className={`plan-shipper ${on ? 'active' : ''}`} onClick={() => setShipperId(String(x._id))} aria-pressed={on}>
                <div className="d-flex align-items-center gap-2">
                  <AdminThumb src={x.info.avatar} name={x.name} size={32} rounded />
                  <div className="flex-grow-1 min-w-0 text-start">
                    <div className="small fw-semibold text-truncate">{x.name}{on && <CheckCircleFill className="text-primary ms-1" />}</div>
                    <div style={{ fontSize: '0.72rem' }} className="text-muted">
                      Đang giữ <b className={`text-${tone}`}>{x.info.load}</b>/{cap}
                      {x.info.rating != null && <> · <StarFill className="text-warning" size={9} /> {x.info.rating}</>}
                      {x.info.deliveredToday > 0 && <> · {x.info.deliveredToday} đơn hôm nay</>}
                    </div>
                  </div>
                </div>
                <ProgressBar now={Math.min(100, (x.info.load / cap) * 100)} variant={tone} style={{ height: 4 }} className="my-1" />
                <div className="d-flex flex-wrap gap-1">
                  {x.recommended && <Badge bg="success" className="fw-normal"><Lightbulb className="me-1" />Đề xuất · {x.reason}</Badge>}
                  {!x.recommended && x.sameArea && <Badge bg="info-subtle" text="info-emphasis" className="fw-normal">Cùng khu vực</Badge>}
                  {x.info.status === 'overloaded' && <Badge bg="danger" className="fw-normal">Quá tải</Badge>}
                  {x.info.lateExpress > 0 && <Badge bg="dark" className="fw-normal">{x.info.lateExpress} hỏa tốc trễ</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      </div>}
      {method === 'simulation' && <p className="small text-muted mt-2">Hệ thống tự tạo mã vận đơn và link theo dõi cho khách.</p>}
      <Button type="submit" size="lg" className="mt-3 w-100" disabled={busy || !method || (method === 'internal' && !shipperId) || (method === 'ghn_sandbox' && current.status !== 'processing')}>
        {busy ? 'Đang xác nhận…' : method === 'ghn_sandbox' ? 'Tạo vận đơn GHN' : method === 'simulation' ? 'Tạo vận đơn giả lập' : shipperId ? `${current.shipperId ? 'Đổi sang' : 'Giao cho'} ${shippers.find((x) => String(x._id) === String(shipperId))?.name || ''}` : 'Chọn nhân viên giao hàng'}
      </Button>
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
      <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={() => setShowHistory((v) => !v)}><ClockHistory className="me-1" />Lịch sử phân công ({current.assignmentLog.length}) {showHistory ? '▴' : '▾'}</Button>
      <Collapse in={showHistory}><div>
      <ul className="list-unstyled small mb-0 mt-2">
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
      </div></Collapse>
    </div>}
  </Modal.Body><Modal.Footer><Button variant="secondary" disabled={busy} onClick={onHide}>Đóng</Button></Modal.Footer></Modal>;
}
