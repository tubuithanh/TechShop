// QUẢN LÝ NHÂN VIÊN (chỉ admin): tổng quan nhân sự, tìm / lọc theo chi nhánh - vị trí - nhóm quyền - trạng thái,
// tạo / sửa tài khoản (gợi ý nhóm quyền theo chức danh, tạo mật khẩu), khóa / mở khóa, đặt lại mật khẩu, xóa (chỉ
// tài khoản chưa từng hoạt động), xuất danh sách CSV.
import { useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge, Card, InputGroup, Alert, Dropdown } from 'react-bootstrap';
import { Search, PersonPlus, Download, ThreeDotsVertical, Shop, ExclamationTriangle, Key, Lock, Unlock, Trash, PersonBadge, Magic, Clipboard } from 'react-bootstrap-icons';
import { staffService } from '../../services/staffService';
import { permissionGroupService } from '../../services/permissionGroupService';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import { Link } from 'react-router-dom';
import { MultiPicker } from '../../components/admin/ScopePicker';
import AuditStamp from '../../components/admin/AuditStamp';
import { downloadCsv } from '../../utils/csvExport';

const emptyForm = { name: '', email: '', password: '', role: 'staff', groupIds: [], storeId: '', managedStoreIds: [], title: '', managerId: '' };

// Chức danh có sẵn -> vị trí -> nhóm quyền gợi ý (tìm nhóm theo tên)
const TITLES = [
  ['Quản lý chi nhánh', 'manager', /quản lý cửa hàng/i],
  ['Cửa hàng trưởng', 'manager', /quản lý cửa hàng/i],
  ['Nhân viên bán hàng', 'sales', /bán hàng/i],
  ['Thu ngân', 'sales', /bán hàng/i],
  ['Nhân viên kho', 'warehouse', /kho/i],
  ['Nhân viên giao hàng', 'delivery', /^giao hàng/i],
  ['Kỹ thuật viên bảo hành', 'warranty', /kỹ thuật|bảo hành/i],
  ['Kế toán chi nhánh', 'accountant', /kế toán chi nhánh/i],
  ['Kế toán trưởng', 'accountant', /kế toán trưởng/i],
  ['Chăm sóc khách hàng', 'sales', /cskh|chăm sóc|hỗ trợ/i]
];
const KINDS = { admin: 'Quản trị viên', manager: 'Quản lý', sales: 'Bán hàng / CSKH', warehouse: 'Kho', delivery: 'Giao hàng', warranty: 'Kỹ thuật bảo hành', accountant: 'Kế toán', other: 'Khác' };
// Vị trí suy từ chức danh (giống trang đăng nhập / Dashboard)
const kindOf = (s) => {
  if (s.role === 'admin') return 'admin';
  const t = String(s.title || '').toLowerCase();
  if (/kế toán/.test(t)) return 'accountant';
  if (/quản lý|trưởng|giám đốc/.test(t) && !/kho/.test(t)) return 'manager';
  if (/kho/.test(t)) return 'warehouse';
  if (/giao hàng|shipper/.test(t)) return 'delivery';
  if (/bảo hành|kỹ thuật/.test(t)) return 'warranty';
  if (/bán hàng|thu ngân|tư vấn|cskh|chăm sóc/.test(t)) return 'sales';
  return 'other';
};
// Mật khẩu ngẫu nhiên dễ đọc (không có ký tự dễ nhầm 0/O, 1/l)
const randomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(10); crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
};
const since = (d) => {
  if (!d) return 'Chưa đăng nhập';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : m < 43200 ? `${Math.round(m / 1440)} ngày trước` : new Date(d).toLocaleDateString('vi-VN');
};

export default function AdminStaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [groups, setGroups] = useState([]);
  const [stores, setStores] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }
  const [newSecret, setNewSecret] = useState(null); // { name, email, password } - hiện 1 lần sau khi tạo / đặt lại
  // Bộ lọc
  const [q, setQ] = useState('');
  const [storeF, setStoreF] = useState('');
  const [kindF, setKindF] = useState('');
  const [groupF, setGroupF] = useState('');
  const [statusF, setStatusF] = useState('active');

  const load = () => staffService.getAll().then(setStaff).catch(() => setNotice({ tone: 'danger', text: 'Không tải được danh sách nhân viên' }));
  useEffect(() => {
    load();
    permissionGroupService.getAll().then(setGroups).catch(() => {});
    storeService.getStores().then(setStores).catch(() => {});
  }, []);

  // ----- Tổng quan
  const stats = useMemo(() => {
    const active = staff.filter((s) => s.isActive !== false);
    const byStore = new Map();
    for (const s of active) {
      const key = s.storeId?.name || (s.role === 'admin' ? null : 'Không gắn chi nhánh');
      if (key) byStore.set(key, (byStore.get(key) || 0) + 1);
    }
    return {
      total: staff.length, active: active.length, locked: staff.length - active.length,
      admins: staff.filter((s) => s.role === 'admin').length,
      noGroup: active.filter((s) => s.role === 'staff' && !(s.groupIds || []).length).length,
      neverLogin: active.filter((s) => !s.lastLoginAt).length,
      byStore: [...byStore.entries()].sort((a, b) => b[1] - a[1])
    };
  }, [staff]);

  // ----- Lọc + sắp xếp (admin -> theo chi nhánh -> theo vị trí -> tên)
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const order = Object.keys(KINDS);
    return staff.filter((s) => {
      if (statusF === 'active' && s.isActive === false) return false;
      if (statusF === 'locked' && s.isActive !== false) return false;
      if (statusF === 'nogroup' && !(s.role === 'staff' && !(s.groupIds || []).length)) return false;
      if (kindF && kindOf(s) !== kindF) return false;
      if (groupF && !(s.groupIds || []).some((g) => (g._id || g) === groupF)) return false;
      if (storeF === 'none' && (s.storeId || s.role === 'admin')) return false;
      if (storeF && storeF !== 'none' && (s.storeId?._id || s.storeId) !== storeF && !(s.managedStoreIds || []).some((m) => (m._id || m) === storeF)) return false;
      return !k || `${s.name} ${s.email} ${s.title || ''}`.toLowerCase().includes(k);
    }).sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0)
      || (a.storeId?.name || 'zz').localeCompare(b.storeId?.name || 'zz', 'vi')
      || order.indexOf(kindOf(a)) - order.indexOf(kindOf(b))
      || a.name.localeCompare(b.name, 'vi'));
  }, [staff, q, storeF, kindF, groupF, statusF]);
  const filtered = q || storeF || kindF || groupF || statusF !== 'active';

  // ----- Form
  const openCreate = () => { setForm({ ...emptyForm, password: randomPassword() }); setEditingId(null); setFormError(''); setShowForm(true); };
  const openEdit = (s) => {
    setForm({
      name: s.name, email: s.email, password: '', role: s.role,
      groupIds: (s.groupIds || []).map((g) => g._id || g),
      storeId: s.storeId?._id || s.storeId || '',
      managedStoreIds: (s.managedStoreIds || []).map((m) => m._id || m),
      title: s.title || '', managerId: s.managerId?._id || s.managerId || ''
    });
    setEditingId(s._id); setFormError(''); setShowForm(true);
  };
  const toggleGroup = (id) => setForm((p) => ({ ...p, groupIds: p.groupIds.includes(id) ? p.groupIds.filter((g) => g !== id) : [...p.groupIds, id] }));
  // Nhóm quyền gợi ý theo chức danh đang nhập
  const suggested = useMemo(() => {
    const t = TITLES.find(([label]) => label.toLowerCase() === form.title.trim().toLowerCase()) || TITLES.find(([, kind]) => kind === kindOf({ role: 'staff', title: form.title }));
    return t ? groups.find((g) => t[2].test(g.name)) : null;
  }, [form.title, groups]);
  const applySuggestion = () => suggested && setForm((p) => ({ ...p, groupIds: p.groupIds.includes(suggested._id) ? p.groupIds : [...p.groupIds, suggested._id] }));
  // Chọn chức danh có sẵn -> tự gán nhóm gợi ý nếu chưa có nhóm nào
  const setTitle = (title) => setForm((p) => {
    const t = TITLES.find(([label]) => label.toLowerCase() === title.trim().toLowerCase());
    const g = t && groups.find((x) => t[2].test(x.name));
    return { ...p, title, groupIds: g && !p.groupIds.length ? [g._id] : p.groupIds };
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (form.role === 'staff' && !form.groupIds.length && !window.confirm('Nhân viên chưa có nhóm quyền nào sẽ KHÔNG làm được việc gì trong trang quản trị. Vẫn lưu?')) return;
    setSaving(true);
    try {
      if (editingId) {
        const payload = {
          name: form.name, email: form.email, role: form.role, groupIds: form.groupIds,
          storeId: form.storeId || null, managedStoreIds: form.role === 'staff' ? form.managedStoreIds : [],
          title: form.title, managerId: form.managerId || null
        };
        if (form.password) payload.newPassword = form.password;
        await staffService.update(editingId, payload);
        setNotice({ tone: 'success', text: `Đã lưu tài khoản ${form.name}` });
        if (form.password) setNewSecret({ name: form.name, email: form.email, password: form.password });
      } else {
        await staffService.create({ ...form, storeId: form.storeId || null, managerId: form.managerId || null });
        setNewSecret({ name: form.name, email: form.email, password: form.password });
      }
      setShowForm(false); setEditingId(null); load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Lưu tài khoản thất bại'); // giữ form, không mất dữ liệu đang nhập
    } finally { setSaving(false); }
  };

  // ----- Thao tác nhanh
  const run = async (fn, okText) => {
    try { await fn(); if (okText) setNotice({ tone: 'success', text: okText }); load(); }
    catch (err) { setNotice({ tone: 'danger', text: err.response?.data?.message || 'Thao tác thất bại' }); }
  };
  const toggleActive = (s) => {
    if (!window.confirm(s.isActive ? `Khóa tài khoản "${s.name}"? Họ không đăng nhập được và bị đăng xuất ngay.` : `Mở khóa tài khoản "${s.name}"?`)) return;
    run(() => staffService.update(s._id, { isActive: !s.isActive }), s.isActive ? `Đã khóa ${s.name}` : `Đã mở khóa ${s.name}`);
  };
  const resetPassword = (s) => {
    if (!window.confirm(`Đặt mật khẩu mới cho "${s.name}"? Họ sẽ bị đăng xuất trên mọi thiết bị.`)) return;
    const password = randomPassword();
    run(async () => { await staffService.update(s._id, { newPassword: password }); setNewSecret({ name: s.name, email: s.email, password }); });
  };
  const remove = (s) => {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản "${s.name}"?\nChỉ xóa được tài khoản CHƯA từng hoạt động (tạo nhầm). Nhân viên nghỉ việc hãy dùng "Khóa".`)) return;
    run(() => staffService.remove(s._id), `Đã xóa ${s.name}`);
  };
  const exportCsv = () => downloadCsv(`nhan-vien-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Họ tên', 'Email', 'Vai trò', 'Chức danh', 'Vị trí', 'Chi nhánh chính', 'Chi nhánh làm thêm', 'Nhóm quyền', 'Quản lý trực tiếp', 'Trạng thái', 'Đăng nhập gần nhất'],
    shown.map((s) => [s.name, s.email, s.role === 'admin' ? 'Admin' : 'Nhân viên', s.title || '', KINDS[kindOf(s)], s.storeId?.name || '', (s.managedStoreIds || []).map((m) => m.name).join('; '),
      s.role === 'admin' ? 'Toàn quyền' : (s.groupIds || []).map((g) => g.name).join('; '), s.managerId?.name || '', s.isActive === false ? 'Đã khóa' : 'Hoạt động', s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString('vi-VN') : '']));

  return (
    <Container fluid>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold mb-1">Quản lý nhân viên</h1>
          <p className="small text-muted mb-0">Tài khoản quản trị / nhân viên, chi nhánh làm việc, nhóm quyền và tuyến báo cáo.</p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/admin/staff-performance" className="btn btn-outline-primary">Hiệu suất & thưởng</Link>
          <Button variant="outline-secondary" onClick={exportCsv} disabled={!shown.length}><Download className="me-1" />Xuất CSV</Button>
          <Button variant="primary" onClick={openCreate}><PersonPlus className="me-1" />Tạo tài khoản</Button>
        </div>
      </div>

      {notice && <Alert variant={notice.tone} dismissible onClose={() => setNotice(null)} className="py-2">{notice.text}</Alert>}
      {/* Mật khẩu vừa tạo / đặt lại: hiện 1 lần để gửi cho nhân viên */}
      {newSecret && (
        <Alert variant="warning" dismissible onClose={() => setNewSecret(null)}>
          <div className="fw-semibold mb-1"><Key className="me-1" />Thông tin đăng nhập của {newSecret.name} (chỉ hiện 1 lần - hãy gửi cho nhân viên)</div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <code className="fs-6">{newSecret.email}</code> / <code className="fs-6">{newSecret.password}</code>
            <Button size="sm" variant="outline-dark" onClick={() => navigator.clipboard?.writeText(`Email: ${newSecret.email}\nMật khẩu: ${newSecret.password}`)}><Clipboard className="me-1" />Sao chép</Button>
          </div>
        </Alert>
      )}

      {/* Tổng quan */}
      <Row xs={2} md={3} xl={6} className="g-2 mb-3">
        {[
          ['Tổng tài khoản', stats.total, '', () => setStatusF('')],
          ['Đang hoạt động', stats.active, 'success', () => setStatusF('active')],
          ['Đã khóa', stats.locked, stats.locked ? 'secondary' : '', () => setStatusF('locked')],
          ['Quản trị viên', stats.admins, 'dark', () => { setStatusF(''); setKindF('admin'); }],
          ['Chưa gán nhóm quyền', stats.noGroup, stats.noGroup ? 'danger' : '', () => setStatusF('nogroup')],
          ['Chưa đăng nhập lần nào', stats.neverLogin, stats.neverLogin ? 'warning' : '', null]
        ].map(([label, value, tone, onClick]) => (
          <Col key={label}>
            <Card role={onClick ? 'button' : undefined} onClick={onClick || undefined} className={`h-100 shadow-sm border-0 ${tone ? `border-start border-4 border-${tone}` : ''}`}>
              <Card.Body className="py-2"><div className="small text-muted">{label}</div><div className="fs-4 fw-bold lh-sm">{value}</div></Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <div className="d-flex flex-wrap gap-2 mb-3 small">
        {stats.byStore.map(([name, n]) => {
          const st = stores.find((x) => x.name === name);
          const key = st ? st._id : 'none';
          return <Button key={name} size="sm" variant={storeF === key ? 'primary' : 'outline-secondary'} onClick={() => setStoreF(storeF === key ? '' : key)}><Shop className="me-1" />{name} <Badge bg="light" text="dark">{n}</Badge></Button>;
        })}
      </div>

      {/* Bộ lọc */}
      <div className="d-flex flex-wrap gap-2 mb-2">
        <InputGroup style={{ maxWidth: 320 }}>
          <InputGroup.Text><Search /></InputGroup.Text>
          <Form.Control placeholder="Tìm tên, email, chức danh…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm nhân viên" />
        </InputGroup>
        <Form.Select style={{ width: 'auto' }} value={storeF} onChange={(e) => setStoreF(e.target.value)} aria-label="Chi nhánh">
          <option value="">Mọi chi nhánh</option>
          {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          <option value="none">Không gắn chi nhánh</option>
        </Form.Select>
        <Form.Select style={{ width: 'auto' }} value={kindF} onChange={(e) => setKindF(e.target.value)} aria-label="Vị trí">
          <option value="">Mọi vị trí</option>
          {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Form.Select>
        <Form.Select style={{ width: 'auto' }} value={groupF} onChange={(e) => setGroupF(e.target.value)} aria-label="Nhóm quyền">
          <option value="">Mọi nhóm quyền</option>
          {groups.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
        </Form.Select>
        <Form.Select style={{ width: 'auto' }} value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Trạng thái">
          <option value="active">Đang hoạt động</option>
          <option value="locked">Đã khóa</option>
          <option value="nogroup">Chưa gán nhóm quyền</option>
          <option value="">Tất cả trạng thái</option>
        </Form.Select>
        {filtered && <Button variant="link" onClick={() => { setQ(''); setStoreF(''); setKindF(''); setGroupF(''); setStatusF('active'); }}>Xóa bộ lọc</Button>}
        <span className="ms-auto align-self-center small text-muted">{shown.length} / {staff.length} tài khoản</span>
      </div>

      <div className="bg-white rounded-3 shadow-sm">
        <Table hover responsive className="mb-0 align-middle small">
          <thead>
            <tr className="text-muted"><th>Nhân viên</th><th>Chi nhánh</th><th>Nhóm quyền</th><th>Báo cáo cho</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th className="text-end">Thao tác</th></tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const self = s._id === user?._id;
              const noGroup = s.role === 'staff' && !(s.groupIds || []).length;
              return (
                <tr key={s._id} className={s.isActive === false ? 'opacity-50' : ''}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 34, height: 34 }}>{(s.name || '?')[0]}</span>
                      <div>
                        <div className="fw-semibold">{s.name}{self && <span className="text-muted fw-normal"> (bạn)</span>}</div>
                        <div className="text-muted">{s.email}</div>
                        <div>{s.role === 'admin' ? <Badge bg="dark">Quản trị viên</Badge> : <><Badge bg="light" text="dark" className="border">{KINDS[kindOf(s)]}</Badge> <span className="text-muted">{s.title}</span></>}</div>
                        <AuditStamp audit={s.audit} />
                      </div>
                    </div>
                  </td>
                  <td>
                    {s.role === 'admin' ? <span className="text-muted">Toàn hệ thống</span>
                      : s.storeId ? <Badge bg="warning" text="dark" className="fw-normal">{s.storeId.name}</Badge>
                        : <span className="text-muted">{s.managedStoreIds?.length ? '' : 'Toàn hệ thống'}</span>}
                    {s.managedStoreIds?.length > 0 && <div className="text-muted mt-1" title={s.managedStoreIds.map((m) => m.name).join(', ')}>+ {s.managedStoreIds.map((m) => m.name).join(', ')}</div>}
                  </td>
                  <td>
                    {s.role === 'admin' ? <span className="text-muted">Toàn quyền</span> : noGroup
                      ? <span className="text-danger"><ExclamationTriangle className="me-1" />Chưa gán - không có quyền</span>
                      : <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 240 }}>{(s.groupIds || []).map((g) => <Badge key={g._id || g} bg="secondary" className="fw-normal">{g.name || '...'}</Badge>)}</div>}
                  </td>
                  <td>{s.managerId?.name ? <>{s.managerId.name}<div className="text-muted">{s.managerId.title}</div></> : <span className="text-muted">—</span>}</td>
                  <td className={s.lastLoginAt ? '' : 'text-warning'}>{since(s.lastLoginAt)}</td>
                  <td><Badge bg={s.isActive !== false ? 'success' : 'secondary'}>{s.isActive !== false ? 'Hoạt động' : 'Đã khóa'}</Badge></td>
                  <td className="text-end text-nowrap">
                    <Button size="sm" variant="outline-primary" className="me-1" onClick={() => openEdit(s)}>Sửa</Button>
                    {s.role === 'staff' && <Link to={`/admin/staff/${s._id}`} className="btn btn-sm btn-outline-secondary me-1"><PersonBadge className="me-1" />Hồ sơ</Link>}
                    {!self && (
                      <Dropdown align="end" className="d-inline-block">
                        <Dropdown.Toggle size="sm" variant="light" className="border" aria-label="Thao tác khác"><ThreeDotsVertical /></Dropdown.Toggle>
                        <Dropdown.Menu popperConfig={{ strategy: 'fixed' }} renderOnMount>
                          <Dropdown.Item onClick={() => resetPassword(s)}><Key className="me-2" />Đặt lại mật khẩu</Dropdown.Item>
                          <Dropdown.Item onClick={() => toggleActive(s)}>{s.isActive !== false ? <><Lock className="me-2" />Khóa tài khoản</> : <><Unlock className="me-2" />Mở khóa</>}</Dropdown.Item>
                          <Dropdown.Divider />
                          <Dropdown.Item className="text-danger" onClick={() => remove(s)}><Trash className="me-2" />Xóa (chỉ tài khoản chưa hoạt động)</Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="p-4 text-center text-muted">{staff.length ? 'Không có tài khoản phù hợp bộ lọc' : 'Chưa có tài khoản nào'}</td></tr>}
          </tbody>
        </Table>
      </div>

      {/* Form tạo / sửa */}
      <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg" backdrop="static">
        <Modal.Header closeButton><Modal.Title className="fs-5">{editingId ? `Sửa tài khoản: ${form.name}` : 'Tạo tài khoản mới'}</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {formError && <Alert variant="danger" className="py-2">{formError}</Alert>}
            <div className="fw-semibold small text-uppercase text-muted mb-2">1. Thông tin đăng nhập</div>
            <Row className="g-3 mb-3">
              <Col md={6}><Form.Label>Họ tên</Form.Label><Form.Control required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Col>
              <Col md={6}><Form.Label>Email</Form.Label><Form.Control required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Col>
              <Col md={6}>
                <Form.Label>{editingId ? 'Đặt lại mật khẩu (để trống nếu không đổi)' : 'Mật khẩu'}</Form.Label>
                <InputGroup>
                  <Form.Control required={!editingId} minLength={6} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingId ? 'Giữ nguyên' : ''} />
                  <Button variant="outline-secondary" onClick={() => setForm({ ...form, password: randomPassword() })} title="Tạo mật khẩu ngẫu nhiên"><Magic /></Button>
                </InputGroup>
                <Form.Text>Mật khẩu hiện ra sau khi lưu để bạn gửi cho nhân viên.</Form.Text>
              </Col>
              <Col md={6}>
                <Form.Label>Vai trò</Form.Label>
                <Form.Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={editingId === user?._id}>
                  <option value="staff">Nhân viên - quyền theo nhóm quyền</option>
                  <option value="admin">Quản trị viên - toàn quyền</option>
                </Form.Select>
              </Col>
            </Row>

            {form.role === 'staff' && (
              <>
                <div className="fw-semibold small text-uppercase text-muted mb-2">2. Vị trí & chi nhánh</div>
                <Row className="g-3 mb-3">
                  <Col md={6}>
                    <Form.Label>Chức danh</Form.Label>
                    <Form.Control list="staff-titles" placeholder="Chọn hoặc nhập chức danh" maxLength={80} value={form.title} onChange={(e) => setTitle(e.target.value)} />
                    <datalist id="staff-titles">{TITLES.map(([t]) => <option key={t} value={t} />)}</datalist>
                    {form.title && <Form.Text>Vị trí: <b>{KINDS[kindOf({ role: 'staff', title: form.title })]}</b></Form.Text>}
                  </Col>
                  <Col md={6}>
                    <Form.Label>Quản lý trực tiếp</Form.Label>
                    <Form.Select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                      <option value="">— Không có —</option>
                      {staff.filter((x) => x._id !== editingId && x.isActive !== false && ['admin', 'manager', 'accountant'].includes(kindOf(x)))
                        .sort((a, b) => (a.storeId?._id === form.storeId ? -1 : 0) - (b.storeId?._id === form.storeId ? -1 : 0) || a.name.localeCompare(b.name, 'vi'))
                        .map((x) => <option key={x._id} value={x._id}>{x.name} - {x.role === 'admin' ? 'Quản trị viên' : x.title}{x.storeId?.name ? ` (${x.storeId.name})` : ''}</option>)}
                    </Form.Select>
                    <Form.Text>Người xem được báo cáo hiệu suất của nhân viên này (quản lý / kế toán trưởng / admin).</Form.Text>
                  </Col>
                  <Col md={6}>
                    <Form.Label>Chi nhánh chính</Form.Label>
                    <Form.Select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value, managedStoreIds: form.managedStoreIds.filter((m) => m !== e.target.value) })}>
                      <option value="">— Không gắn (thấy dữ liệu MỌI chi nhánh) —</option>
                      {stores.map((s) => <option key={s._id} value={s._id}>{s.name} — {s.city}</option>)}
                    </Form.Select>
                    {!form.storeId && !form.managedStoreIds.length && <Form.Text className="text-warning">Không gắn chi nhánh = phạm vi toàn hệ thống (chỉ dành cho quản lý vùng / kế toán trưởng).</Form.Text>}
                  </Col>
                  <Col md={6}>
                    <Form.Label>Chi nhánh làm thêm</Form.Label>
                    <MultiPicker value={form.managedStoreIds} onChange={(v) => setForm({ ...form, managedStoreIds: v })}
                      options={stores.filter((st) => st._id !== form.storeId).map((st) => ({ value: st._id, label: `${st.name} — ${st.city}` }))} placeholder="Tìm chi nhánh..." />
                    <Form.Text>Điều chuyển tạm thời làm ở trang Hồ sơ nhân viên.</Form.Text>
                  </Col>
                </Row>

                <div className="d-flex align-items-center mb-2">
                  <span className="fw-semibold small text-uppercase text-muted flex-grow-1">3. Nhóm quyền</span>
                  {suggested && !form.groupIds.includes(suggested._id) && (
                    <Button size="sm" variant="outline-success" onClick={applySuggestion}><Magic className="me-1" />Gán nhóm gợi ý: {suggested.name}</Button>
                  )}
                </div>
                <div className="border rounded-3 p-2 mb-1" style={{ maxHeight: 260, overflow: 'auto' }}>
                  {groups.map((g) => (
                    <Form.Check key={g._id} type="checkbox" id={`group-${g._id}`} className={`py-1 px-4 rounded ${form.groupIds.includes(g._id) ? 'bg-primary-subtle' : ''}`}
                      label={<span><b>{g.name}</b>{suggested?._id === g._id && <Badge bg="success" className="ms-1 fw-normal">gợi ý</Badge>} <span className="text-muted">· {(g.permissions || []).length} quyền{g.description ? ` · ${g.description}` : ''}</span></span>}
                      checked={form.groupIds.includes(g._id)} onChange={() => toggleGroup(g._id)} />
                  ))}
                  {!groups.length && <div className="small text-muted">Chưa có nhóm quyền - tạo ở trang "Nhóm quyền" trước.</div>}
                </div>
                {!form.groupIds.length && <div className="small text-danger"><ExclamationTriangle className="me-1" />Chưa chọn nhóm quyền - nhân viên sẽ không làm được việc gì.</div>}
              </>
            )}
            {form.role === 'admin' && <Alert variant="info" className="small mb-0">Quản trị viên có toàn quyền trên mọi chi nhánh - không cần chi nhánh và nhóm quyền.</Alert>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button type="submit" variant="success" disabled={saving}>{saving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo tài khoản'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
