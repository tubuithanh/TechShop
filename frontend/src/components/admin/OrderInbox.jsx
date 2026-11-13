import { useCallback, useEffect, useState } from 'react';
import { Card, Table, Button, Badge, Spinner, Modal, Form, Alert } from 'react-bootstrap';
import { Inbox, ExclamationTriangleFill, Gear, ArrowClockwise, CheckCircleFill } from 'react-bootstrap-icons';
import api from '../../services/api';
import AdminPagination from './AdminPagination';
import { orderMethod } from '../../utils/orderWorkflow';
import AuditStamp from './AuditStamp';

const formatVND = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';

// "3 giờ 20 phút", "2 ngày 4 giờ"
function duration(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ${m % 60 ? ` ${m % 60} phút` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} ngày${h % 24 ? ` ${h % 24} giờ` : ''}`;
}
// Màu theo mức gấp: < 50% ngưỡng: xám, 50-100%: vàng, quá hạn: đỏ
function urgency(inbox) {
  const r = inbox.waitedMinutes / inbox.limitMinutes;
  if (r >= 1) return { bg: 'danger', text: undefined };
  if (r >= 0.5) return { bg: 'warning', text: 'dark' };
  return { bg: 'light', text: 'dark' };
}

const CATEGORY_COLOR = {
  transfer: 'primary', refund: 'warning', payment: 'info', confirm: 'danger', delivery_issue: 'danger', returns: 'secondary', prepare: 'info', pickup: 'success'
};

// Việc cần làm: đơn đang chờ nhân viên xử lý, gấp nhất lên đầu. renderActions(o) = đúng các nút thao tác của danh sách
// thường (dùng chung, không viết lại). reloadKey đổi -> tải lại (sau mỗi thao tác).
export default function OrderInbox({ renderActions, onDetails, reloadKey, isAdmin }) {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slaOpen, setSlaOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/orders/admin/inbox', { params: { category: category || undefined, page, limit: 20 } })
      .then((r) => setRes(r.data))
      .catch(() => setRes((cur) => cur || { data: [], counts: {}, categories: [], total: 0, totalPages: 1 }))
      .finally(() => setLoading(false));
  }, [category, page]);
  useEffect(() => { load(); }, [load, reloadKey]);
  // Tự làm mới mỗi phút để thời gian chờ / quá hạn luôn đúng
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const pick = (key) => { setCategory((cur) => (cur === key ? '' : key)); setPage(1); };
  const cats = res?.categories || [];
  const totalAll = cats.reduce((s, c) => s + (res.counts[c.key]?.total || 0), 0);
  const overdueAll = cats.reduce((s, c) => s + (res.counts[c.key]?.overdue || 0), 0);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <div className="small text-muted">
          {res ? <>Có <b className="text-body">{totalAll}</b> đơn cần xử lý{overdueAll > 0 && <>, <b className="text-danger">{overdueAll} quá hạn</b></>}. Gấp nhất ở trên cùng.</> : 'Đang tải...'}
        </div>
        <div className="d-flex gap-2">
          <Button size="sm" variant="outline-secondary" onClick={load} disabled={loading}><ArrowClockwise /> Làm mới</Button>
          {isAdmin && <Button size="sm" variant="outline-secondary" onClick={() => setSlaOpen(true)}><Gear /> Ngưỡng cảnh báo</Button>}
        </div>
      </div>

      {/* Thẻ đếm theo nhóm việc - bấm để lọc */}
      <div className="inbox-cards mb-3">
        <button type="button" className={`inbox-card${!category ? ' active' : ''}`} onClick={() => pick('')}>
          <span className="inbox-card-label"><Inbox /> Tất cả việc</span>
          <span className="inbox-card-count">{totalAll}</span>
          {overdueAll > 0 && <span className="inbox-card-overdue">{overdueAll} quá hạn</span>}
        </button>
        {cats.map((c) => {
          const n = res.counts[c.key] || { total: 0, overdue: 0 };
          if (!n.total && category !== c.key) return null; // ẩn nhóm không có việc cho gọn
          return (
            <button key={c.key} type="button" className={`inbox-card${category === c.key ? ' active' : ''}`} onClick={() => pick(c.key)}>
              <span className="inbox-card-label"><span className={`order-status-dot bg-${CATEGORY_COLOR[c.key]}`} /> {c.label}</span>
              <span className="inbox-card-count">{n.total}</span>
              {n.overdue > 0 && <span className="inbox-card-overdue"><ExclamationTriangleFill /> {n.overdue} quá hạn</span>}
            </button>
          );
        })}
      </div>

      <Card className="shadow-sm">
        {res && res.data.length === 0 ? (
          <Card.Body className="text-center py-5">
            <CheckCircleFill size={36} className="text-success mb-2" />
            <div className="fw-semibold">Không còn việc nào{category ? ' ở nhóm này' : ''}</div>
            <div className="small text-muted">Mọi đơn đều đã được xử lý. Xem toàn bộ đơn ở chế độ "Tất cả đơn".</div>
          </Card.Body>
        ) : (
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr className="text-muted small">
                <th className="p-3">Việc cần làm</th>
                <th className="p-3">Đơn</th>
                <th className="p-3">Khách hàng</th>
                <th className="p-3">Cửa hàng</th>
                <th className="p-3 text-end">Tổng tiền</th>
                <th className="p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {!res && <tr><td colSpan={6} className="text-center p-4"><Spinner size="sm" /></td></tr>}
              {res?.data.map((o) => {
                const u = urgency(o.inbox);
                return (
                  <tr key={o._id} className={o.inbox.overdue ? 'inbox-row-overdue' : ''}>
                    <td className="p-3" style={{ minWidth: 190 }}>
                      <Badge bg={CATEGORY_COLOR[o.inbox.category]} className="fw-normal">{o.inbox.label}</Badge>
                      <div className="mt-1">
                        <Badge bg={u.bg} text={u.text} className="fw-normal" title={`Ngưỡng: ${duration(o.inbox.limitMinutes)}`}>
                          {o.inbox.overdue && <ExclamationTriangleFill className="me-1" />}
                          Chờ {duration(o.inbox.waitedMinutes)}
                        </Badge>
                      </div>
                    <AuditStamp audit={o.audit} /></td>
                    <td className="p-3">
                      <Button variant="link" size="sm" className="p-0" onClick={() => onDetails(o)}>{o.orderCode}</Button>
                      <div className="small text-muted">{orderMethod(o)}</div>
                    </td>
                    <td className="p-3">
                      {o.deliveryAddress?.fullName || o.userId?.displayName}
                      <div className="small text-muted">{o.deliveryAddress?.phone || o.userId?.phoneNumber}</div>
                    </td>
                    <td className="p-3">{o.storeId?.name}</td>
                    <td className="p-3 text-end fw-medium">{formatVND(o.grandTotal)}</td>
                    <td className="p-3" style={{ minWidth: 220 }}>{renderActions(o)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {res && res.totalPages > 1 && (
          <Card.Body className="pt-0"><AdminPagination page={page} totalPages={res.totalPages} total={res.total} onChange={setPage} /></Card.Body>
        )}
      </Card>

      {slaOpen && <SlaModal categories={cats} onHide={() => setSlaOpen(false)} onSaved={() => { setSlaOpen(false); load(); }} />}
    </>
  );
}

// Admin chỉnh ngưỡng quá hạn (phút) cho từng nhóm việc
function SlaModal({ categories, onHide, onSaved }) {
  const [values, setValues] = useState(Object.fromEntries(categories.map((c) => [c.key, c.limitMinutes])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.put('/orders/admin/inbox/sla', Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])));
      onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được'); } finally { setBusy(false); }
  };
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title className="fs-5">Ngưỡng cảnh báo quá hạn</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="small text-muted">Đơn chờ lâu hơn ngưỡng sẽ bị đánh dấu đỏ "quá hạn" và đẩy lên đầu danh sách. Tính bằng phút (5 phút - 30 ngày).</p>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
        {categories.map((c) => (
          <Form.Group key={c.key} className="d-flex align-items-center gap-2 mb-2">
            <Form.Label className="small mb-0 flex-grow-1">{c.label}</Form.Label>
            <Form.Control type="number" size="sm" min={5} max={43200} style={{ width: 110 }} value={values[c.key]}
              onChange={(e) => setValues({ ...values, [c.key]: e.target.value })} />
            <span className="small text-muted" style={{ width: 110 }}>= {duration(Number(values[c.key]) || 0)}</span>
          </Form.Group>
        ))}
        <Button variant="link" size="sm" className="p-0" onClick={() => setValues(Object.fromEntries(categories.map((c) => [c.key, c.defaultMinutes])))}>Khôi phục mặc định</Button>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Hủy</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
      </Modal.Footer>
    </Modal>
  );
}
