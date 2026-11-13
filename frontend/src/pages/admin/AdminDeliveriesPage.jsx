import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Form, Nav, Table } from 'react-bootstrap';
import { Lightbulb, LightningChargeFill, Magic, ArrowClockwise, XLg } from 'react-bootstrap-icons';
import { DispatchKpis, ShipperCards, PendingAreas, suggestShipper } from '../../components/admin/DispatchBoard';
import api from '../../services/api';
import { orderLabel } from '../../utils/orderWorkflow';
import AdminPagination from '../../components/admin/AdminPagination';
import { useSettings } from '../../store/SettingsContext';
import { useAuth } from '../../store/AuthContext';
import DeliveryPlanModal from '../../components/admin/DeliveryPlanModal';
import { SHIPMENT_LABELS } from '../../components/ShipmentTracking';

// Quản lý chi nhánh (quyền deliveries.manage): phân công đơn giao tận nơi cho nhân viên giao hàng (UC37) và xác
// nhận đã nhận tiền COD nhân viên giao hàng nộp về (UC40). Nhân viên gắn chi nhánh chỉ thấy đơn chi nhánh mình.
const money = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const STATUS = { confirmed: 'Đã xác nhận', processing: 'Đang xử lý', shipping: 'Đang giao' };
const ASSIGNABLE = ['confirmed', 'processing'];
const ACTIVE_SHIPMENT = ['creating', 'unknown', 'active'];
// Thẻ lọc theo giai đoạn ở tab "Đơn cần giao"
const STAGES = [
  { key: 'assign', label: 'Tất cả', variant: 'secondary' },
  { key: 'pending', label: 'Chưa phân công', variant: 'danger' },
  { key: 'ready', label: 'Đã phân công - chờ lấy hàng', variant: 'warning' },
  { key: 'shipping', label: 'Đang giao', variant: 'primary' },
  { key: 'failed', label: 'Giao lỗi', variant: 'danger' }
];
const ago = (d) => {
  if (!d) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} giờ` : `${Math.floor(h / 24)} ngày`;
};
const fmt = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
// Lần cập nhật trạng thái gần nhất (để biết đơn đã chờ phân công bao lâu)
const lastChange = (o) => (o.statusHistory || []).reduce((t, h) => (h.changedAt && new Date(h.changedAt) > t ? new Date(h.changedAt) : t), new Date(o.createdAt || 0));

// Ô "Giao hàng": ai / đơn vị nào đang giao, ai phân công, lúc nào
function AssigneeCell({ o, suggestion, onQuickAssign, busy }) {
  const carrier = o.shipment && ACTIVE_SHIPMENT.includes(o.shipment.phase) ? o.shipment : null;
  return (
    <div className="small">
      {carrier ? (
        <>
          <Badge bg="info" text="dark" className="fw-normal">{carrier.environment === 'sandbox' ? 'GHN sandbox' : 'Vận chuyển giả lập'}</Badge>
          <div className="text-break mt-1"><code>{carrier.code || 'Đang tạo vận đơn...'}</code></div>
          {carrier.status && <div className="text-muted">{SHIPMENT_LABELS[carrier.status] || carrier.status}</div>}
        </>
      ) : o.shipperId ? (
        <>
          <Badge bg="success" className="fw-normal">Shop tự giao</Badge>
          <div className="fw-medium mt-1">{o.shipperId.name}</div>
        </>
      ) : (
        <>
          <Badge bg="danger" className="fw-normal">Chưa phân công</Badge>
          {ASSIGNABLE.includes(o.status) && <div className="text-danger mt-1">Chờ {ago(lastChange(o))}</div>}
          {suggestion && (
            <div className="dispatch-suggest mt-1">
              <Lightbulb className="text-warning me-1" />Gợi ý: <b>{suggestion.shipper.name}</b>
              <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>{suggestion.reason}</span>
              <Button size="sm" variant="success" className="mt-1 py-0" disabled={busy} onClick={() => onQuickAssign(o, suggestion.shipper)}>Giao cho {suggestion.shipper.name.split(' ').slice(-1)[0]}</Button>
            </div>
          )}
        </>
      )}
      {o.assignedByName && (o.shipperId || carrier) && (
        <div className="text-muted mt-1" title="Người phân công gần nhất">Phân công bởi <b>{o.assignedByName}</b>{o.assignedAt && ` · ${fmt(o.assignedAt)}`}</div>
      )}
    </div>
  );
}

export default function AdminDeliveriesPage() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const [stores, setStores] = useState([]), [storeId, setStoreId] = useState('');
  const scoped = user?.role === 'staff' && (user?.storeScope?.current || user?.storeId);
  const pageSize = settings.productsPerPage || 20;
  const [view, setView] = useState('assign');
  const [stage, setStage] = useState('assign'); // giai đoạn lọc trong tab "Đơn cần giao"
  const [stages, setStages] = useState(null);
  const [planning, setPlanning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [codTotal, setCodTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState(null);
  const [shipperFilter, setShipperFilter] = useState('');
  const [selected, setSelected] = useState([]);
  const [bulkShipper, setBulkShipper] = useState('');
  const [notice, setNotice] = useState('');
  const loadId = useRef(0);
  const loadBoard = useCallback(() => api.get('/deliveries/board', { params: { storeId: storeId || undefined } }).then((r) => setBoard(r.data.data)).catch(() => {}), [storeId]);
  useEffect(() => { loadBoard(); const t = setInterval(loadBoard, 30000); return () => clearInterval(t); }, [loadBoard]);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/deliveries', { params: { view: view === 'assign' ? stage : view, q: query, page, limit: pageSize, storeId, shipperId: shipperFilter || undefined } });
      if (id !== loadId.current) return;
      if (page > 1 && page > data.totalPages) { setPage(Math.max(1, data.totalPages)); return; }
      setOrders(data.data);
      setTotal(data.total); setTotalPages(data.totalPages); setCodTotal(data.codTotal);
      if (data.stages) setStages(data.stages);
    } catch (err) {
      if (id === loadId.current) setError(err.response?.data?.message || 'Không tải được danh sách');
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [view, stage, query, page, pageSize, storeId, shipperFilter]);

  useEffect(() => {
    load();
    return () => { loadId.current++; };
  }, [load]);
  useEffect(() => {
    if (!scoped) api.get('/stores').then(({ data }) => setStores(data.data)).catch(() => setStores([]));
  }, []);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác không thành công');
    }
    load(); loadBoard();
    setBusy(false);
  };

  // Đơn chưa phân công được, có thể phân công ngay (không đang điều phối / không có vận đơn)
  const assignable = (o) => ASSIGNABLE.includes(o.status) && !o.shipperId && !o.activeTransferId && !ACTIVE_SHIPMENT.includes(o.shipment?.phase);
  // Hỏa tốc lên đầu (hạn gần nhất trước), sau đó đơn chờ lâu nhất
  const sorted = useMemo(() => [...orders].sort((a, b) => {
    const da = a.express?.deadline ? new Date(a.express.deadline).getTime() : Infinity;
    const db = b.express?.deadline ? new Date(b.express.deadline).getTime() : Infinity;
    return da - db || lastChange(a) - lastChange(b);
  }), [orders]);
  const suggestions = useMemo(() => {
    if (!board) return {};
    const out = {};
    for (const o of sorted) if (assignable(o)) { const sg = suggestShipper(o, board.shippers, board.cap); if (sg) out[o._id] = sg; }
    return out;
  }, [sorted, board]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignTo = (orderId, shipperId) => api.put(`/deliveries/${orderId}/assign`, { shipperId: String(shipperId) });
  const quickAssign = (o, shipper) => run(async () => { await assignTo(o._id, shipper._id); setNotice(`Đã giao đơn ${o.orderCode} cho ${shipper.name}`); });
  // Phân công hàng loạt: cho 1 người, hoặc "thông minh" (chia theo khu vực + tải công việc)
  const bulkAssign = (mode) => run(async () => {
    const list = sorted.filter((o) => selected.includes(o._id) && assignable(o));
    const planned = {}; let ok = 0; const fail = [];
    for (const o of list) {
      let shipper = mode === 'smart' ? suggestShipper(o, board.shippers, board.cap, planned)?.shipper : board.shippers.find((x) => String(x._id) === bulkShipper);
      if (!shipper) { fail.push(`${o.orderCode}: không còn shipper phù hợp`); continue; }
      try { await assignTo(o._id, shipper._id); planned[shipper._id] = (planned[shipper._id] || 0) + 1; ok += 1; }
      catch (err) { fail.push(`${o.orderCode}: ${err.response?.data?.message || 'lỗi'}`); }
    }
    setSelected([]);
    setNotice(`Đã phân công ${ok}/${list.length} đơn` + (fail.length ? `. Chưa được: ${fail.join('; ')}` : ''));
  });
  const pageAssignable = sorted.filter(assignable);
  const toggleAll = () => setSelected(selected.length === pageAssignable.length ? [] : pageAssignable.map((o) => o._id));
  const settle = (orderId) => run(() => api.post(`/deliveries/${orderId}/settle-cod`));

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <h3 className="mb-0">Phân công giao hàng</h3>
        <Button size="sm" variant="outline-secondary" className="ms-auto" onClick={() => { load(); loadBoard(); }}><ArrowClockwise className="me-1" />Làm mới</Button>
      </div>
      {board && view === 'assign' && (
        <>
          <DispatchKpis summary={board.summary} onPick={(k) => { if (k === 'cod') setView('cod'); else { setStage(k === 'express' || k === 'pending' ? 'pending' : 'shipping'); } setPage(1); }} />
          <ShipperCards shippers={board.shippers} cap={board.cap} selected={shipperFilter} onSelect={(id) => { setShipperFilter(id); setStage('assign'); setPage(1); }} />
          {shipperFilter && <div className="small mb-2">Đang xem đơn của <b>{board.shippers.find((x) => String(x._id) === shipperFilter)?.name}</b> <Button size="sm" variant="link" className="p-0" onClick={() => setShipperFilter('')}><XLg /> Bỏ lọc</Button></div>}
          {(stage === 'pending' || stage === 'assign') && !shipperFilter && <PendingAreas areas={board.pendingAreas} onPick={(a) => { setSearch(a); setStage('pending'); }} />}
        </>
      )}
      {notice && <Alert variant="success" dismissible onClose={() => setNotice('')} className="py-2 small">{notice}</Alert>}
      {!scoped && <Form.Select className="mb-3" aria-label="Lọc chi nhánh giao hàng" value={storeId} onChange={e => { setStoreId(e.target.value); setPage(1); }}><option value="">Tất cả chi nhánh</option>{stores.map(s => <option value={s._id} key={s._id}>{s.name}</option>)}</Form.Select>}
      <Nav variant="tabs" activeKey={view} onSelect={(k) => { setView(k); setPage(1); }} className="mb-3">
        <Nav.Item><Nav.Link eventKey="assign">Đơn cần giao</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="cod">Tiền COD chờ đối soát</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="returns">Nhận hàng trả về</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="carrier">Vận đơn / COD GHN</Nav.Link></Nav.Item>
      </Nav>
      {view === 'assign' && (
        <div className="order-status-tabs mb-3" role="tablist" aria-label="Lọc theo giai đoạn giao hàng">
          {STAGES.map((st) => {
            const count = st.key === 'assign'
              ? (stages ? stages.pending + stages.ready + stages.shipping : null)
              : stages?.[st.key];
            if (st.key === 'failed' && !count && stage !== 'failed') return null;
            return (
              <button key={st.key} type="button" role="tab" aria-selected={stage === st.key}
                className={`order-status-tab${stage === st.key ? ' active' : ''}`} onClick={() => { setStage(st.key); setPage(1); }}>
                {st.key !== 'assign' && <span className={`order-status-dot bg-${st.variant}`} />}
                {st.label}
                {count != null && <span className="order-status-count">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="d-flex gap-2 mb-2"><Form.Control type="search" aria-label="Tìm đơn giao hàng" placeholder="Tìm mã đơn, tên người nhận, SĐT, sản phẩm…" value={search} onChange={e => setSearch(e.target.value)} /><Button variant="outline-secondary" disabled={!search} onClick={() => { setSearch(''); setQuery(''); setPage(1); }}>Xóa tìm kiếm</Button></div>
      <p className="small text-muted">{loading ? 'Đang tải…' : `${total} đơn phù hợp`}</p>
      {error && <Alert variant="danger">{error}</Alert>}

      {view === 'assign' && pageAssignable.length > 0 && board && (
        <div className={`dispatch-bulk mb-2 ${selected.length ? 'active' : ''}`}>
          <span className="small"><b>{selected.length}</b> đơn đã chọn</span>
          <Form.Select size="sm" style={{ width: 'auto' }} value={bulkShipper} onChange={(e) => setBulkShipper(e.target.value)} aria-label="Chọn nhân viên giao hàng">
            <option value="">Chọn nhân viên…</option>
            {board.shippers.map((x) => <option key={x._id} value={x._id}>{x.name} · đang giữ {x.load}{x.status === 'overloaded' ? ' (quá tải)' : ''}</option>)}
          </Form.Select>
          <Button size="sm" disabled={busy || !selected.length || !bulkShipper} onClick={() => bulkAssign('one')}>Phân công</Button>
          <Button size="sm" variant="warning" disabled={busy || !selected.length} onClick={() => bulkAssign('smart')} title="Chia theo khu vực và tải công việc của từng nhân viên"><Magic className="me-1" />Tự phân công thông minh</Button>
          {!selected.length && <Button size="sm" variant="link" onClick={toggleAll}>Chọn tất cả {pageAssignable.length} đơn chưa phân công</Button>}
        </div>
      )}
      {view !== 'cod' ? (
        <Table responsive hover size="sm" className="align-middle">
          <thead>
            <tr>
              {view === 'assign' && <th style={{ width: 28 }}><Form.Check aria-label="Chọn tất cả" checked={pageAssignable.length > 0 && selected.length === pageAssignable.length} onChange={toggleAll} disabled={!pageAssignable.length} /></th>}
              <th>Mã đơn</th>
              <th>Người nhận</th>
              <th>Địa chỉ</th>
              <th>Chi nhánh</th>
              <th>Tổng tiền</th>
              <th>Trạng thái</th>
              <th style={{ minWidth: 210 }}>Giao hàng</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o._id} className={o.express?.deadline && new Date(o.express.deadline) < Date.now() && !['delivered', 'cancelled'].includes(o.status) ? 'dispatch-row-late' : assignable(o) ? 'inbox-row-overdue' : ''}>
                {view === 'assign' && <td>{assignable(o) && <Form.Check aria-label={`Chọn đơn ${o.orderCode}`} checked={selected.includes(o._id)} onChange={() => setSelected(selected.includes(o._id) ? selected.filter((x) => x !== o._id) : [...selected, o._id])} />}</td>}
                <td>
                  {o.orderCode}
                  {o.express?.deadline && (() => {
                    const m = Math.round((new Date(o.express.deadline) - Date.now()) / 60000);
                    return <div><Badge bg={m < 0 ? 'dark' : m <= 30 ? 'danger' : 'warning'} text={m > 30 ? 'dark' : undefined}><LightningChargeFill size={10} /> {m < 0 ? `TRỄ ${-m}p` : `Hỏa tốc · còn ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`}</Badge></div>;
                  })()}
                </td>
                <td>
                  {o.deliveryAddress?.fullName}
                  <div className="small text-muted">{o.deliveryAddress?.phone}</div>
                </td>
                <td className="small">{[o.deliveryAddress?.addressLine1, o.deliveryAddress?.addressLine2, o.deliveryAddress?.city].filter(Boolean).join(', ')}</td>
                <td>{o.storeId?.name}</td>
                <td>
                  {money(o.grandTotal)}
                  {o.paymentMode === 'cod' && <Badge bg="warning" text="dark" className="ms-1">COD</Badge>}
                </td>
                <td>
                  {STATUS[o.status] || orderLabel(o)}
                  {o.shipment?.code && <div className="small">{SHIPMENT_LABELS[o.shipment.status] || o.shipment.status}</div>}
                  {o.activeTransferId && <div className="small text-warning">Chờ điều phối chi nhánh</div>}
                  {o.deliveryAttempts?.some((a) => a.result === 'failed') && (
                    <div className="small text-danger">Giao lỗi {o.deliveryAttempts.filter((a) => a.result === 'failed').length} lần</div>
                  )}
                </td>
                <td>
                  <AssigneeCell o={o} suggestion={view === 'assign' ? suggestions[o._id] : null} onQuickAssign={quickAssign} busy={busy} />
                  <div className="mt-2">
                  {o.status === 'returning' ? <><Button size="sm" variant="outline-primary" onClick={() => setPlanning(o)}>Theo dõi</Button><Button className="mt-2" size="sm" disabled={busy} onClick={() => { if (window.confirm('Xác nhận đã nhận đủ hàng trả về?')) run(() => api.post(`/deliveries/${o._id}/receive-return`, { received: true })); }}>Nhận hàng trả</Button></> : <Button size="sm" disabled={!!o.activeTransferId} variant={ASSIGNABLE.includes(o.status) && !['creating','unknown','active'].includes(o.shipment?.phase) ? 'primary' : 'outline-primary'} onClick={() => setPlanning(o)}>{ASSIGNABLE.includes(o.status) && !['creating','unknown','active'].includes(o.shipment?.phase) ? (o.shipperId ? 'Đổi phân công' : 'Phân công') : 'Theo dõi'}</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted">Không có đơn giao tận nơi đang chờ giao</td>
              </tr>
            )}
          </tbody>
        </Table>
      ) : (
        <>
          <p>
            Tổng tiền chờ đối soát{query ? ' theo tìm kiếm' : ''}: <strong>{money(codTotal)}</strong>
          </p>
          <Table responsive hover size="sm" className="align-middle">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Nhân viên giao hàng</th>
                <th>Thu lúc</th>
                <th>Số tiền</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id}>
                  <td>{o.orderCode}</td>
                  <td>{o.shipperId?.name || '—'}</td>
                  <td className="small">{new Date(o.codCollectedAt).toLocaleString('vi-VN')}</td>
                  <td>{money(o.grandTotal)}</td>
                  <td>
                    <Button size="sm" onClick={() => settle(o._id)}>Đã nhận tiền</Button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">Không có tiền COD chờ đối soát</td>
                </tr>
              )}
            </tbody>
          </Table>
        </>
      )}
      <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
      {planning && <DeliveryPlanModal key={planning._id} order={planning} board={board} onHide={() => setPlanning(null)} onChanged={() => { load(); loadBoard(); }} />}
    </div>
  );
}