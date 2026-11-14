import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Form, InputGroup, Table, Toast, ToastContainer } from 'react-bootstrap';
import { Search, XLg } from 'react-bootstrap-icons';
import OrderActions, { ReasonModal } from '../../components/admin/OrderActions';
import DeliveryPlanModal from '../../components/admin/DeliveryPlanModal';
import OrderWorkPanel from '../../components/admin/OrderWorkPanel';
import { EInvoiceModal } from './AdminEInvoicesPage';
import EInvoiceDraftModal from '../../components/admin/EInvoiceDraftModal';
import { hasPagePermission } from '../../utils/permissions';
import { orderActions as allowedTransitions } from '../../utils/orderWorkflow';
import api from '../../services/api';
import HandoverModal from '../../components/admin/HandoverModal';
import OrderReceipt from '../../components/admin/OrderReceipt';
import OrderTransfers from '../../components/admin/OrderTransfers';
import OrderEditModal from '../../components/admin/OrderEditModal';
import { ORDER_LABELS, orderActions, orderMethod, orderLabel } from '../../utils/orderWorkflow';
import { orderService } from '../../services/orderService';
import { storeService } from '../../services/storeService';
import { useSettings } from '../../store/SettingsContext';
import { useAuth } from '../../store/AuthContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';
import EInvoiceExportModal from '../../components/admin/EInvoiceExportModal';
import RefundModal from '../../components/admin/RefundModal';
import OrderInbox from '../../components/admin/OrderInbox';
import { FileEarmarkSpreadsheet } from 'react-bootstrap-icons';
import { downloadCsv } from '../../utils/csvExport';
import AuditStamp from '../../components/admin/AuditStamp';
import { orderDateTime, timeAgo } from '../../utils/orderTime';

const statusOptions = Object.keys(ORDER_LABELS); // mọi trạng thái cho bộ lọc
// Màu badge theo trạng thái (admin.css đổi sang dạng pill nền nhạt)
const STATUS_VARIANT = {
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  ready_for_pickup: 'primary',
  shipping: 'primary',
  returning: 'warning',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'secondary'
};

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function AdminOrdersPage() {
  const [handover, setHandover] = useState(null);
  const [details, setDetails] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showInvoiceExport, setShowInvoiceExport] = useState(false);
  const [refunding, setRefunding] = useState(null); // đơn đang mở hộp thoại hoàn tiền
  const [view, setViewState] = useState(() => (new URLSearchParams(window.location.search).get('view') === 'all' ? 'all' : 'inbox')); // tab đang xem: việc cần làm (mặc định) / tất cả
  const setView = (v) => {
    setViewState(v);
    const url = new URL(window.location.href);
    if (v === 'all') url.searchParams.set('view', 'all'); else url.searchParams.delete('view');
    window.history.replaceState(null, '', url); // ghi tab lên URL mà không tải lại trang
  };
  const [inboxKey, setInboxKey] = useState(0); // đổi -> "Việc cần làm" tải lại sau mỗi thao tác
  const { settings } = useSettings();
  const { user } = useAuth();
  const pageSize = settings.productsPerPage || 20; // số đơn mỗi trang theo cấu hình
  const query = useListQuery(['status', 'paymentStatus', 'refundStatus', 'paymentMode', 'storeId', 'source', 'deliveryMethod', 'from', 'to']); // bộ lọc lưu trên URL
  const { data: orders, total, totalPages, loading, meta, reload: reloadList } = useAdminList(orderService.getAllOrdersAdmin, { // tải danh sách theo bộ lọc
    ...query.apiParams,
    limit: pageSize
  });
  const loadOrders = () => { reloadList(); setInboxKey((k) => k + 1); }; // tải lại cả 2 tab sau mỗi thao tác
  useEffect(() => { setSelected([]); }, [query.apiParams.page, query.apiParams.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = query.values.page;
  const setPage = query.setPage;

  // Xuất danh sách đơn ra file CSV (mở được bằng Excel) theo đúng bộ lọc đang chọn
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      // Tối đa 200 đơn - giới hạn mỗi trang của backend (paginationGuard)
      const res = await orderService.getAllOrdersAdmin({ ...query.apiParams, page: 1, limit: 200 }); // đúng bộ lọc đang chọn
      const list = res.data || [];
      if (list.length === 0) {
        alert('Không có đơn nào để xuất');
        return;
      }
      const header = ['Mã đơn', 'Thời gian đặt', 'Khách hàng', 'Trạng thái', 'Tổng tiền'];
      const rows = list.map((o) => [
        o.orderCode,
        new Date(o.createdAt).toLocaleString('vi-VN'),
        o.deliveryAddress?.fullName,
        ORDER_LABELS[o.status] || o.status,
        o.grandTotal
      ]);
      downloadCsv(`don-hang-${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
      // SỬA LỖI: trước đây file chỉ có 200 đơn đầu nhưng không báo -> người xuất tưởng là đủ. Nay cảnh báo rõ.
      if ((res.total || 0) > list.length) {
        alert(`File chỉ gồm ${list.length}/${res.total} đơn (mới nhất). Hãy lọc theo khoảng ngày nhỏ hơn rồi xuất nhiều lần để đủ dữ liệu.`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Xuất file thất bại');
    } finally {
      setExporting(false);
    }
  }

  // Quản lý chi nhánh chỉ thấy đơn chi nhánh mình (backend tự lọc) -> không cần bộ lọc chi nhánh
  const [stores, setStores] = useState([]);
  const scoped = user?.role === 'staff' && Boolean(user?.storeId); // nhân viên chi nhánh: không cần lọc chi nhánh
  useEffect(() => {
    if (!scoped) storeService.getStores().then(setStores).catch(() => setStores([])); // lỗi -> bộ lọc chi nhánh trống, trang vẫn dùng được
  }, [scoped]);

  const filters = [
    { key: 'status', label: 'Trạng thái', options: statusOptions.map((s) => ({ value: s, label: ORDER_LABELS[s] })) },
    { key: 'source', label: 'Nguồn đơn', options: [{ value: 'online', label: 'Online' }, { value: 'pos', label: 'Tại quầy' }] },
    { key: 'deliveryMethod', label: 'Nhận hàng', options: [{ value: 'home_delivery', label: 'Giao tận nơi' }, { value: 'store_pickup', label: 'Tại cửa hàng' }] },
    {
      key: 'paymentStatus',
      label: 'Thanh toán',
      options: [
        { value: 'pending', label: 'Chưa thanh toán' },
        { value: 'paid', label: 'Đã thanh toán' },
        { value: 'failed', label: 'Thất bại' },
        { value: 'refunded', label: 'Đã hoàn tiền' }
      ]
    },
    {
      key: 'refundStatus',
      label: 'Hoàn tiền',
      options: [
        { value: 'pending', label: 'Chờ hoàn tiền' },
        { value: 'completed', label: 'Đã hoàn tiền' }
      ]
    },
    {
      key: 'paymentMode',
      label: 'Hình thức',
      options: [
        { value: 'cod', label: 'COD' },
        { value: 'cash', label: 'Tiền mặt tại quầy' },
        { value: 'vnpay', label: 'VNPay' },
        { value: 'bank_transfer', label: 'Chuyển khoản' },
        { value: 'momo', label: 'MoMo' }
      ]
    },
    ...(scoped ? [] : [{ key: 'storeId', label: 'Chi nhánh', options: stores.map((st) => ({ value: st._id, label: st.name })) }]), // chỉ admin / nhân viên toàn hệ thống mới có bộ lọc chi nhánh
    { key: 'from', label: 'Từ ngày', type: 'date' },
    { key: 'to', label: 'Đến ngày', type: 'date' }
  ];

  // Thông báo nhẹ góc màn hình thay cho alert()
  const [toasts, setToasts] = useState([]);
  const notify = (text, tone = 'success') => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, text, tone }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000); }; // thông báo góc màn hình, tự ẩn sau 4 giây
  const [reasonTarget, setReasonTarget] = useState(null); // { status, orders } -> hộp thoại lý do
  const [delivering, setDelivering] = useState(null);
  const [working, setWorking] = useState(null); // { order, list } -> khung xử lý đơn bên phải
  const [einvoiceId, setEinvoiceId] = useState(null);
  const [draftOrder, setDraftOrder] = useState(null); // xem trước hóa đơn trước khi phát hành
  // TÌM NHANH (luôn hiện, cả tab "Việc cần làm"): Enter -> chuyển sang "Tất cả đơn" với từ khóa;
  // gõ đúng mã đơn và chỉ ra 1 kết quả -> mở luôn khung xử lý đơn đó
  const [quick, setQuick] = useState(query.values.q || '');
  const openExact = useRef(''); // mã đơn vừa tìm (để mở thẳng khung xử lý)
  const quickRef = useRef(null);
  useEffect(() => { setQuick(query.values.q || ''); }, [query.values.q]);
  const runQuick = (e) => {
    e?.preventDefault();
    const q = quick.trim();
    openExact.current = q.toUpperCase().replace(/^#/, ''); // cho phép gõ "#DH123"
    if (view !== 'all') setView('all');
    query.update({ q: q.replace(/^#/, ''), status: '' }); // tìm trên mọi trạng thái
  };
  const sawLoading = useRef(false);
  useEffect(() => {
    if (!openExact.current) return;
    if (loading) { sawLoading.current = true; return; }
    if (!sawLoading.current) return; // chờ kết quả MỚI của lần tìm này (không dùng danh sách cũ)
    const hit = orders.find((o) => o.orderCode?.toUpperCase() === openExact.current) || (orders.length === 1 ? orders[0] : null); // khớp mã đơn hoặc chỉ có 1 kết quả
    if (hit) setWorking({ order: hit, list: orders });
    openExact.current = ''; sawLoading.current = false;
  }, [orders, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  // Phím "/" hoặc Ctrl+F (khi không đang gõ) -> nhảy vào ô tìm nhanh
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return; // đang gõ trong ô khác -> không bắt phím
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) { e.preventDefault(); quickRef.current?.focus(); quickRef.current?.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [selected, setSelected] = useState([]);
  const canDeliver = hasPagePermission(user, '/admin/deliveries'); // được phân công giao hàng?

  // Đổi trạng thái 1 hoặc nhiều đơn; trả về số đơn thành công
  const changeStatus = async (list, status, reason) => {
    setBusy(true);
    let ok = 0; const fails = [];
    for (const o of list) { // lần lượt từng đơn (backend kiểm tra từng đơn)
      try { await orderService.updateOrderStatus(o._id, status, reason || `Cập nhật trạng thái: ${ORDER_LABELS[status]}`); ok += 1; }
      catch (err) { fails.push(`${o.orderCode}: ${err.response?.data?.message || 'lỗi'}`); } // đơn lỗi không chặn đơn khác
    }
    setBusy(false); loadOrders();
    if (ok) notify(list.length === 1 ? `Đơn ${list[0].orderCode} → ${ORDER_LABELS[status]}` : `Đã chuyển ${ok}/${list.length} đơn sang "${ORDER_LABELS[status]}"`);
    if (fails.length) notify(fails.join('; '), 'danger');
    return ok;
  };
  const action = async (o, path, payload, message, done) => {
    if (message && !window.confirm(message)) return; // hỏi xác nhận trước thao tác tiền / kho
    setBusy(true);
    try { await api.post(`/orders/${o._id}/${path}`, payload); notify(done || 'Đã lưu'); }
    catch (err) { notify(err.response?.data?.message || 'Không thể lưu', 'danger'); }
    finally { setBusy(false); loadOrders(); }
  };
  // Một điểm xử lý mọi thao tác của nút chính + menu ⋯
  const runAction = (o, key) => {
    if (key.startsWith('status:')) return changeStatus([o], key.slice(7)); // "status:confirmed" -> đổi ngay
    if (key.startsWith('reason:')) return setReasonTarget({ status: key.slice(7), orders: [o] }); // "reason:cancelled" -> hỏi lý do trước
    switch (key) {
      case 'confirm-payment': return action(o, 'confirm-payment', { confirmed: true }, `Xác nhận đã nhận đủ ${formatVND(o.grandTotal)} chuyển khoản cho đơn ${o.orderCode}?`, 'Đã xác nhận nhận tiền chuyển khoản');
      case 'receive-return': return action(o, 'receive-return', { received: true }, 'Xác nhận đã nhận và kiểm đếm đầy đủ hàng trả? Hệ thống sẽ hoàn kho.', 'Đã nhận hàng trả, tồn kho đã hoàn lại');
      case 'refund': return setRefunding(o);
      case 'handover': return setHandover(o);
      case 'edit': return setEditing(o);
      case 'transfer': return setTransfer(o);
      case 'deliver': return setDelivering(o);
      case 'einvoice-view': return setEinvoiceId(o.einvoice._id);
      case 'einvoice': return setDraftOrder(o);
      default: return undefined;
    }
  };

  // Nút thao tác của 1 đơn - dùng chung cho "Việc cần làm" và "Tất cả đơn"
  const renderActions = (o) => <OrderActions o={o} busy={busy} canDeliver={canDeliver} onRun={runAction} />;
  // Thao tác hàng loạt trên các đơn đã chọn (chỉ áp cho đơn được phép)
  const selectedOrders = orders.filter((o) => selected.includes(o._id)); // đơn đang tick chọn
  const bulkTargets = (status) => selectedOrders.filter((o) => !o.activeTransferId && allowedTransitions(o).includes(status) && !(status === 'confirmed' && ['vnpay', 'momo'].includes(o.paymentMode) && o.paymentStatus !== 'paid')); // chỉ đơn hợp lệ cho thao tác hàng loạt (đúng sơ đồ trạng thái, online đã trả tiền)
  const toggleSelect = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
        <h1 className="fs-4 fw-bold mb-0">Quản lý đơn hàng</h1>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" disabled={exporting} onClick={exportCsv}>
            {exporting ? 'Đang xuất...' : 'Xuất CSV'}
          </Button>
          <Button variant="success" className="d-flex align-items-center gap-2" onClick={() => setShowInvoiceExport(true)}>
            <FileEarmarkSpreadsheet /> Xuất hóa đơn điện tử
          </Button>
        </div>
      </div>
      {refunding && <RefundModal order={refunding} onHide={() => setRefunding(null)} onDone={() => { setRefunding(null); loadOrders(); }} />}
      {showInvoiceExport && (
        <EInvoiceExportModal
          apiParams={query.apiParams}
          shippingVatRate={settings.shippingVatRate ?? 10}
          onHide={() => setShowInvoiceExport(false)}
        />
      )}

      <Form onSubmit={runQuick} className="order-quick-search mb-3">
        <InputGroup size="lg">
          <InputGroup.Text><Search /></InputGroup.Text>
          <Form.Control ref={quickRef} type="search" placeholder="Tìm đơn: mã đơn, tên / SĐT khách, tên sản phẩm…  (phím /)" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Tìm đơn hàng" />
          {quick && <Button variant="outline-secondary" onClick={() => { setQuick(''); query.update({ q: '' }); }} aria-label="Xóa tìm kiếm"><XLg /></Button>}
          <Button type="submit" disabled={!quick.trim()}>Tìm</Button>
        </InputGroup>
        {view === 'all' && query.values.q && <div className="small text-muted mt-1">{loading ? 'Đang tìm…' : `${total} đơn khớp "${query.values.q}"`}{!loading && total === 0 && ' - thử tìm bằng số điện thoại hoặc vài chữ trong tên khách'}</div>}
      </Form>
      <div className="order-view-switch mb-3" role="tablist" aria-label="Chế độ xem đơn hàng">
        <button type="button" role="tab" aria-selected={view === 'inbox'} className={view === 'inbox' ? 'active' : ''} onClick={() => setView('inbox')}>
          Việc cần làm
        </button>
        <button type="button" role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
          Tất cả đơn
        </button>
      </div>

      <OrderTransfers order={transfer} onClose={() => setTransfer(null)} onChanged={loadOrders} />
      {view === 'inbox' ? (
        <OrderInbox renderActions={renderActions} onDetails={(o) => setWorking({ order: o, list: [o] })} onOpen={(o, list) => setWorking({ order: o, list })} reloadKey={inboxKey} isAdmin={user?.role === 'admin'} />
      ) : (
      <>
      <AdminSearchBar
        query={query}
        placeholder="Mã đơn, tên người nhận, SĐT, tên sản phẩm..."
        filters={filters}
        total={total}
        loading={loading}
      />

      {/* Tab lọc nhanh theo trạng thái - số đếm theo đúng các bộ lọc khác đang chọn */}
      <div className="order-status-tabs mb-3" role="tablist" aria-label="Lọc theo trạng thái">
        {[{ value: '', label: 'Tất cả' }, ...statusOptions.map((s) => ({ value: s, label: ORDER_LABELS[s] }))].map((t) => {
          const counts = meta?.statusCounts || {};
          const count = t.value ? counts[t.value] || 0 : Object.values(counts).reduce((a, b) => a + b, 0);
          const active = (query.values.status || '') === t.value;
          if (t.value && !count && !active) return null; // ẩn trạng thái không có đơn nào cho gọn
          return (
            <button
              key={t.value || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              className={`order-status-tab${active ? ' active' : ''}`}
              onClick={() => query.update({ status: t.value })}
            >
              {t.value && <span className={`order-status-dot bg-${STATUS_VARIANT[t.value]}`} />}
              {t.label}
              <span className="order-status-count">{count}</span>
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="order-bulk mb-2">
          <span className="small"><b>{selected.length}</b> đơn đã chọn</span>
          {[['confirmed', 'Xác nhận', 'primary'], ['processing', 'Bắt đầu chuẩn bị', 'primary'], ['ready_for_pickup', 'Sẵn sàng nhận', 'primary']].map(([st, label, variant]) => {
            const n = bulkTargets(st).length;
            return n > 0 && <Button key={st} size="sm" variant={variant} disabled={busy} onClick={async () => { await changeStatus(bulkTargets(st), st); setSelected([]); }}>{label} ({n})</Button>;
          })}
          {bulkTargets('cancelled').length > 0 && <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => setReasonTarget({ status: 'cancelled', orders: bulkTargets('cancelled') })}>Hủy ({bulkTargets('cancelled').length})</Button>}
          <Button size="sm" variant="link" onClick={() => setSelected([])}>Bỏ chọn</Button>
        </div>
      )}
      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0">
          <thead>
            <tr className="text-muted">
              <th className="p-3" style={{ width: 36 }}><Form.Check aria-label="Chọn tất cả" checked={orders.length > 0 && selected.length === orders.length} onChange={() => setSelected(selected.length === orders.length ? [] : orders.map((o) => o._id))} /></th>
              <th className="p-3">Mã đơn</th>
              <th className="p-3 text-nowrap">Thời gian đặt</th>
              <th className="p-3">Khách hàng</th>
              <th className="p-3">Cửa hàng</th>
              <th className="p-3">Tổng tiền</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id} className={`order-row-click ${selected.includes(o._id) ? 'table-active' : ''}`} onClick={(e) => { if (!e.target.closest('button, a, input, .dropdown, .dropdown-menu')) setWorking({ order: o, list: orders }); }}>
                <td className="p-3"><Form.Check aria-label={`Chọn đơn ${o.orderCode}`} checked={selected.includes(o._id)} onChange={() => toggleSelect(o._id)} /></td>
                <td className="p-3"><Button variant="link" className="p-0 fw-semibold" onClick={() => setWorking({ order: o, list: orders })}>{o.orderCode}</Button><div className="small">{orderMethod(o)}</div>
                  {o.invoiceInfo?.taxCode && (
                    <span className="badge bg-info mt-1" title={`${o.invoiceInfo.companyName} - MST ${o.invoiceInfo.taxCode}`}>
                      HĐ công ty
                    </span>
                  )}
                <AuditStamp audit={o.audit} /></td>
                <td className="p-3 text-nowrap small">{orderDateTime(o.createdAt)}<div className="text-muted">{timeAgo(o.createdAt)}</div></td>
                <td className="p-3">
                  {o.deliveryAddress?.fullName || o.userId?.displayName}
                  <div className="small text-muted">{o.deliveryAddress?.phone || o.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{o.storeId?.name}</td>
                <td className="p-3">{formatVND(o.grandTotal)}</td>
                <td className="p-3">
                  <Badge bg={STATUS_VARIANT[o.status] || 'secondary'}>{orderLabel(o)}</Badge>
                  {o.activeTransferId && <div className="small text-warning">Đang chờ điều phối</div>}
                  {o.confirmedAt && <div className="small text-muted">Xác nhận: {o.confirmedByName || 'Nhân viên'}<br />{new Date(o.confirmedAt).toLocaleString('vi-VN')}</div>}
                  {o.paymentStatus === 'paid' && <div className="small text-success mt-1">Đã thanh toán</div>}
                  {['pending', 'processing'].includes(o.refundStatus) && <div className="small text-warning mt-1">{o.refundStatus === 'processing' ? 'Đang hoàn tiền...' : 'Chờ hoàn tiền'}</div>}
                  {o.refundStatus === 'completed' && o.refundInfo?.method && <div className="small text-success mt-1">Đã hoàn {o.refundInfo.method === 'gateway' ? `qua ${o.refundInfo.gateway === 'vnpay' ? 'VNPay' : 'MoMo'}` : 'thủ công'}</div>}
                </td>
                <td className="p-3" style={{ minWidth: 220 }}>{renderActions(o)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card.Body className="pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </Card.Body>
      </Card>
      </>
      )}
      {handover && <HandoverModal key={handover._id} order={handover} onHide={() => setHandover(null)} onDone={() => { setHandover(null); loadOrders(); }} />}
      {details && <OrderReceipt order={details} onHide={() => setDetails(null)} />}
      {editing && <OrderEditModal key={editing._id} order={editing} onClose={() => setEditing(null)} onChanged={loadOrders} />}
      {reasonTarget && <ReasonModal key={reasonTarget.status + reasonTarget.orders.length} target={reasonTarget} onHide={() => setReasonTarget(null)} onSubmit={async (reason) => { const t = reasonTarget; setReasonTarget(null); await changeStatus(t.orders, t.status, reason); setSelected([]); }} />}
      {delivering && <DeliveryPlanModal key={delivering._id} order={delivering} onHide={() => setDelivering(null)} onChanged={loadOrders} />}
      {draftOrder && <EInvoiceDraftModal orderId={draftOrder._id} onHide={() => setDraftOrder(null)} onIssued={(inv) => { setDraftOrder(null); notify(`Đã phát hành hóa đơn số ${String(inv.number).padStart(8, '0')}${(inv.emailQueuedTo || inv.emailedTo) ? ` · đang gửi email tới ${inv.emailQueuedTo || inv.emailedTo}` : ''}`); setEinvoiceId(inv._id); loadOrders(); }} />}
      {einvoiceId && <EInvoiceModal id={einvoiceId} onHide={(nextId) => { setEinvoiceId(nextId || null); loadOrders(); }} onChanged={(text) => { notify(text); loadOrders(); }} />}
      {working && <OrderWorkPanel order={working.order} list={working.list} busy={busy} canDeliver={canDeliver} onClose={() => setWorking(null)} onSelect={(o) => setWorking((w) => ({ ...w, order: o }))} onReceipt={setDetails} onRun={runAction} />}
      <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1080 }}>
        {toasts.map((t) => (
          <Toast key={t.id} bg={t.tone} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <Toast.Body className="text-white">{t.text}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </div>
  );
}
