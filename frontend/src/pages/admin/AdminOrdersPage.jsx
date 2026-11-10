import { useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Table } from 'react-bootstrap';
import api from '../../services/api';
import HandoverModal from '../../components/admin/HandoverModal';
import OrderReceipt from '../../components/admin/OrderReceipt';
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
import { FileEarmarkSpreadsheet } from 'react-bootstrap-icons';
import { downloadCsv } from '../../utils/csvExport';

const statusOptions = Object.keys(ORDER_LABELS);
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
  const [busy, setBusy] = useState(false);
  const [showInvoiceExport, setShowInvoiceExport] = useState(false);
  const { settings } = useSettings();
  const { user } = useAuth();
  const pageSize = settings.productsPerPage || 20;
  const query = useListQuery(['status', 'paymentStatus', 'paymentMode', 'storeId', 'source', 'deliveryMethod', 'from', 'to']);
  const { data: orders, total, totalPages, loading, meta, reload: loadOrders } = useAdminList(orderService.getAllOrdersAdmin, {
    ...query.apiParams,
    limit: pageSize
  });
  const page = query.values.page;
  const setPage = query.setPage;

  // Xuất danh sách đơn ra file CSV (mở được bằng Excel) theo đúng bộ lọc đang chọn
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      // Tối đa 200 đơn - giới hạn mỗi trang của backend (paginationGuard)
      const res = await orderService.getAllOrdersAdmin({ ...query.apiParams, page: 1, limit: 200 });
      const list = res.data || [];
      if (list.length === 0) {
        alert('Không có đơn nào để xuất');
        return;
      }
      const header = ['Mã đơn', 'Ngày tạo', 'Khách hàng', 'Trạng thái', 'Tổng tiền'];
      const rows = list.map((o) => [
        o.orderCode,
        new Date(o.createdAt).toLocaleString('vi-VN'),
        o.deliveryAddress?.fullName,
        ORDER_LABELS[o.status] || o.status,
        o.grandTotal
      ]);
      downloadCsv(`don-hang-${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
    } catch (err) {
      alert(err.response?.data?.message || 'Xuất file thất bại');
    } finally {
      setExporting(false);
    }
  }

  // Quản lý chi nhánh chỉ thấy đơn chi nhánh mình (backend tự lọc) -> không cần bộ lọc chi nhánh
  const [stores, setStores] = useState([]);
  const scoped = user?.role === 'staff' && Boolean(user?.storeId);
  useEffect(() => {
    if (!scoped) storeService.getStores().then(setStores);
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
    ...(scoped ? [] : [{ key: 'storeId', label: 'Chi nhánh', options: stores.map((st) => ({ value: st._id, label: st.name })) }]),
    { key: 'from', label: 'Từ ngày', type: 'date' },
    { key: 'to', label: 'Đến ngày', type: 'date' }
  ];

  const handleChangeStatus = async (orderId, status) => {
    const reason = ['returning', 'cancelled'].includes(status) ? window.prompt('Nhập lý do:') : '';
    if (['returning', 'cancelled'].includes(status) && !reason?.trim()) return;
    setBusy(true);
    try {
      await orderService.updateOrderStatus(orderId, status, reason || `Cập nhật trạng thái: ${ORDER_LABELS[status]}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái đơn hàng');
    }
    // Luôn tải lại dù thành công hay thất bại - dropdown đang hiển thị lựa chọn người dùng vừa
    // chọn (chưa chắc đã lưu), tải lại để đồng bộ đúng trạng thái thật từ server.
    loadOrders();
    setBusy(false);
  };
  const action = async (o, path, payload, message) => {
    if (!window.confirm(message)) return;
    setBusy(true);
    try { await api.post(`/orders/${o._id}/${path}`, payload); }
    catch (err) { alert(err.response?.data?.message || 'Không thể lưu'); }
    finally { setBusy(false); loadOrders(); }
  };

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
      {showInvoiceExport && (
        <EInvoiceExportModal
          apiParams={query.apiParams}
          shippingVatRate={settings.shippingVatRate ?? 10}
          onHide={() => setShowInvoiceExport(false)}
        />
      )}

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

      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Mã đơn</th>
              <th className="p-3">Khách hàng</th>
              <th className="p-3">Cửa hàng</th>
              <th className="p-3">Tổng tiền</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id}>
                <td className="p-3"><Button variant="link" size="sm" onClick={() => setDetails(o)}>{o.orderCode}</Button><div className="small">{orderMethod(o)}</div>
                  {o.invoiceInfo?.taxCode && (
                    <span className="badge bg-info mt-1" title={`${o.invoiceInfo.companyName} - MST ${o.invoiceInfo.taxCode}`}>
                      HĐ công ty
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {o.deliveryAddress?.fullName || o.userId?.displayName}
                  <div className="small text-muted">{o.deliveryAddress?.phone || o.userId?.phoneNumber}</div>
                </td>
                <td className="p-3">{o.storeId?.name}</td>
                <td className="p-3">{formatVND(o.grandTotal)}</td>
                <td className="p-3">
                  <Badge bg={STATUS_VARIANT[o.status] || 'secondary'}>{orderLabel(o)}</Badge>
                  {o.paymentStatus === 'paid' && <div className="small text-success mt-1">Đã thanh toán</div>}
                  {o.refundStatus === 'pending' && <div className="small text-warning mt-1">Chờ hoàn tiền</div>}
                </td>
                <td className="p-3">
                  <Form.Select
                    size="sm"
                    value={o.status}
                    disabled={busy || orderActions(o).length === 0}
                    onChange={(e) => handleChangeStatus(o._id, e.target.value)}
                  >
                    <option value={o.status}>{orderLabel(o)}</option>
                    {orderActions(o).map((s) => (
                      <option key={s} value={s}>
                        {ORDER_LABELS[s]}
                      </option>
                    ))}
                  </Form.Select>
                  {o.deliveryMethod === 'store_pickup' && ['ready_for_pickup', 'shipping'].includes(o.status) && <Button className="mt-1" size="sm" disabled={busy} onClick={() => setHandover(o)}>Bàn giao cho khách</Button>}
                  {o.status === 'returning' && <Button className="mt-1" size="sm" disabled={busy} onClick={() => action(o, 'receive-return', { received: true }, 'Xác nhận đã nhận và kiểm đếm đầy đủ hàng trả? Hệ thống sẽ hoàn kho.')}>Đã nhận hàng trả</Button>}
                  {o.paymentMode === 'bank_transfer' && ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping'].includes(o.status) && o.paymentStatus !== 'paid' && <Button className="mt-1" size="sm" disabled={busy} onClick={() => action(o, 'confirm-payment', { confirmed: true }, 'Xác nhận đã nhận đủ tiền chuyển khoản?')}>Đã nhận chuyển khoản</Button>}
                  {o.refundStatus === 'pending' && ['cancelled', 'returned'].includes(o.status) && <Button className="mt-1" variant="warning" size="sm" disabled={busy} onClick={() => { const note = window.prompt('Ghi chú/mã giao dịch hoàn tiền thực tế:'); if (note?.trim()) action(o, 'confirm-refund', { confirmed: true, note }, 'Xác nhận khách đã nhận đủ tiền hoàn?'); }}>Xác nhận hoàn tiền</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card.Body className="pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </Card.Body>
      </Card>
      {handover && <HandoverModal key={handover._id} order={handover} onHide={() => setHandover(null)} onDone={() => { setHandover(null); loadOrders(); }} />}
      {details && <OrderReceipt order={details} onHide={() => setDetails(null)} />}
    </div>
  );
}
