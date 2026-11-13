import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Form, Nav, Table } from 'react-bootstrap';
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
function AssigneeCell({ o }) {
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
  const loadId = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/deliveries', { params: { view: view === 'assign' ? stage : view, q: query, page, limit: pageSize, storeId } });
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
  }, [view, stage, query, page, pageSize, storeId]);

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
    load();
    setBusy(false);
  };
  const settle = (orderId) => run(() => api.post(`/deliveries/${orderId}/settle-cod`));

  return (
    <div>
      <h3 className="mb-3">Phân công giao hàng</h3>
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

      {view !== 'cod' ? (
        <Table responsive hover size="sm" className="align-middle">
          <thead>
            <tr>
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
            {orders.map((o) => (
              <tr key={o._id} className={ASSIGNABLE.includes(o.status) && !o.shipperId && !ACTIVE_SHIPMENT.includes(o.shipment?.phase) ? 'inbox-row-overdue' : ''}>
                <td>{o.orderCode}</td>
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
                  <AssigneeCell o={o} />
                  <div className="mt-2">
                  {o.status === 'returning' ? <><Button size="sm" variant="outline-primary" onClick={() => setPlanning(o)}>Theo dõi</Button><Button className="mt-2" size="sm" disabled={busy} onClick={() => { if (window.confirm('Xác nhận đã nhận đủ hàng trả về?')) run(() => api.post(`/deliveries/${o._id}/receive-return`, { received: true })); }}>Nhận hàng trả</Button></> : <Button size="sm" disabled={!!o.activeTransferId} variant={ASSIGNABLE.includes(o.status) && !['creating','unknown','active'].includes(o.shipment?.phase) ? 'primary' : 'outline-primary'} onClick={() => setPlanning(o)}>{ASSIGNABLE.includes(o.status) && !['creating','unknown','active'].includes(o.shipment?.phase) ? (o.shipperId ? 'Đổi phân công' : 'Phân công') : 'Theo dõi'}</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">Không có đơn giao tận nơi đang chờ giao</td>
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
      {planning && <DeliveryPlanModal key={planning._id} order={planning} onHide={() => setPlanning(null)} onChanged={load} />}
    </div>
  );
}