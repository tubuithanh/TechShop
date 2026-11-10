import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Table, Badge, Button, Form, Alert, Spinner, InputGroup } from 'react-bootstrap';
import { staffService } from '../../services/staffService';

const RELATION = {
  home: { label: 'Chi nhánh chính', bg: 'primary' },
  extra: { label: 'Làm thêm', bg: 'info' },
  transfer: { label: 'Điều chuyển tới', bg: 'warning' }
};

// Nhân viên của 1 chi nhánh: xem ai đang làm ở đây, thêm nhân viên (kể cả người đang làm ở chi nhánh khác),
// cho thôi làm ở chi nhánh này. 1 nhân viên có thể làm ở nhiều chi nhánh.
export default function StoreStaffModal({ store, onHide, onChanged }) {
  const [rows, setRows] = useState(null);
  const [allStaff, setAllStaff] = useState([]);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => staffService.byStore(store._id).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
    staffService.getAll().then((list) => setAllStaff(list.filter((s) => s.role === 'staff' && s.isActive))).catch(() => {});
  }, [store._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberIds = new Set((rows || []).filter((r) => r.relation !== 'transfer').map((r) => String(r._id)));
  const candidates = allStaff.filter((s) => !memberIds.has(String(s._id)));

  const run = async (fn) => {
    setError(''); setBusy(true);
    try { await fn(); await load(); onChanged?.(); } catch (err) { setError(err.response?.data?.message || 'Không cập nhật được'); } finally { setBusy(false); }
  };
  const add = () => run(async () => { await staffService.addToStore(store._id, pick); setPick(''); });
  const remove = (r) => {
    if (!window.confirm(`${r.name} thôi làm việc ở ${store.name}?`)) return;
    run(() => staffService.removeFromStore(store._id, r._id));
  };

  return (
    <Modal show onHide={onHide} size="lg" centered>
      <Modal.Header closeButton><Modal.Title className="fs-5">Nhân viên - {store.name}</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}
        <Form.Label className="small fw-medium">Thêm nhân viên vào chi nhánh</Form.Label>
        <InputGroup className="mb-1">
          <Form.Select value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)}>
            <option value="">-- Chọn nhân viên --</option>
            {candidates.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}{s.title ? ` (${s.title})` : ''}{s.storeId?.name ? ` - đang ở ${s.storeId.name}` : ' - chưa có chi nhánh'}
              </option>
            ))}
          </Form.Select>
          <Button disabled={!pick || busy} onClick={add}>Thêm</Button>
        </InputGroup>
        <div className="small text-muted mb-3">
          Nhân viên chưa có chi nhánh: đây thành chi nhánh chính. Đã có: thêm chi nhánh này vào nơi làm việc (vẫn giữ chi nhánh cũ).
          Tạo tài khoản mới ở trang <Link to="/admin/staff">Nhân viên</Link>.
        </div>

        {!rows ? <div className="text-center py-3"><Spinner size="sm" /></div> : rows.length === 0 ? (
          <div className="text-center text-muted py-4 border rounded-3">Chi nhánh chưa có nhân viên nào</div>
        ) : (
          <Table hover responsive size="sm" className="mb-0 align-middle">
            <thead><tr className="small text-muted"><th>Nhân viên</th><th>Nhóm quyền</th><th>Quan hệ với chi nhánh</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className={r.isActive ? '' : 'opacity-50'}>
                  <td>
                    <Link to={`/admin/staff/${r._id}`} className="fw-medium text-decoration-none">{r.name}</Link>
                    <div className="small text-muted">{r.title || r.email}</div>
                  </td>
                  <td className="small">{r.groups.join(', ') || <span className="text-danger">Chưa có quyền</span>}</td>
                  <td>
                    <Badge bg={RELATION[r.relation].bg} text={r.relation === 'transfer' ? 'dark' : undefined} className="fw-normal">{RELATION[r.relation].label}</Badge>
                    <div className="small text-muted">
                      {r.relation === 'extra' && r.homeStore && `Chi nhánh chính: ${r.homeStore}`}
                      {r.relation === 'home' && r.storeCount > 1 && `Làm ở ${r.storeCount} chi nhánh`}
                      {r.relation === 'transfer' && `Đến ${new Date(r.until).toLocaleDateString('vi-VN')} · từ ${r.homeStore || '—'}`}
                    </div>
                  </td>
                  <td className="text-end">
                    {r.relation !== 'transfer' && (
                      <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => remove(r)}>Thôi làm ở đây</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal.Body>
    </Modal>
  );
}
