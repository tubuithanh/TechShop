import { useEffect, useMemo, useState } from 'react';
import { Badge, Form, InputGroup, Nav } from 'react-bootstrap';
import { Search, PersonBadge, Shop, KeyFill, Globe2 } from 'react-bootstrap-icons';
import api from '../services/api';

// Nhóm theo vị trí bên trong mỗi tab
const GROUPS = [
  ['admin', 'Quản trị viên'], ['manager', 'Quản lý'], ['accountant', 'Kế toán'], ['sales', 'Bán hàng / CSKH'], ['warehouse', 'Kho'],
  ['delivery', 'Giao hàng'], ['warranty', 'Kỹ thuật bảo hành'], ['other', 'Khác'], ['customer', 'Khách hàng']
];
const COMMON = '__common'; // tab "Chung": tài khoản không gắn chi nhánh (admin, kế toán trưởng, quản lý vùng...) + khách hàng
const TAB_KEY = 'login.demoTab';
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || COMMON; } catch { return COMMON; } };

// TÀI KHOẢN DEMO trên trang đăng nhập: lấy từ máy chủ (tài khoản quản trị / nhân viên đang hoạt động).
// Chia tab: "Chung" + từng chi nhánh; trong tab chia theo vị trí. Mật khẩu chỉ hiện khi máy chủ xác minh đúng là
// mật khẩu demo. Bấm 1 dòng để điền sẵn vào form.
export default function DemoAccounts({ onPick }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [onlyReady, setOnlyReady] = useState(true);
  const [tab, setTabState] = useState(readTab);
  const setTab = (t) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* trình duyệt chặn lưu trữ */ } };
  useEffect(() => { api.get('/auth/demo-accounts').then((r) => setData(r.data.data)).catch(() => setData({ enabled: false })); }, []);

  // Tài khoản đủ điều kiện hiển thị (lọc "chỉ có mật khẩu demo")
  const all = useMemo(() => (data?.enabled ? [...data.customers, ...data.staff].filter((a) => !onlyReady || a.password) : []), [data, onlyReady]);

  // Danh sách tab: Chung + các chi nhánh (theo tên, kèm số tài khoản)
  const tabs = useMemo(() => {
    const count = new Map();
    for (const a of all) for (const s of [a.store, ...a.extraStores].filter(Boolean)) count.set(s, (count.get(s) || 0) + 1);
    const common = all.filter((a) => !a.store).length;
    return [[COMMON, 'Chung', common], ...[...count.entries()].sort((x, y) => x[0].localeCompare(y[0], 'vi')).map(([name, n]) => [name, name, n])];
  }, [all]);
  const current = tabs.some(([k]) => k === tab) ? tab : COMMON; // tab đã lưu không còn -> về "Chung"

  const groups = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k
      // Đang tìm: tìm trên MỌI tab
      ? all.filter((a) => `${a.name} ${a.email} ${a.title} ${a.store} ${a.extraStores.join(' ')}`.toLowerCase().includes(k))
      : current === COMMON
        ? all.filter((a) => !a.store) // không gắn chi nhánh chính
        : all.filter((a) => a.store === current || a.extraStores.includes(current)); // chi nhánh chính hoặc làm thêm ở đây
    return GROUPS.map(([key, label]) => [label, list.filter((a) => a.kind === key)]).filter(([, l]) => l.length);
  }, [all, q, current]);

  if (!data?.enabled) return null;
  const readyCount = [...data.customers, ...data.staff].filter((a) => a.password).length;
  return (
    <div className="mt-4 small bg-light rounded p-3 demo-accounts">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <span className="fw-semibold text-body"><PersonBadge className="me-1" />Tài khoản đăng nhập thử</span>
        <Badge bg="secondary" className="fw-normal">{readyCount} tài khoản sẵn mật khẩu</Badge>
      </div>
      <InputGroup size="sm" className="mb-2">
        <InputGroup.Text><Search /></InputGroup.Text>
        <Form.Control placeholder="Tìm theo tên, email, chức danh, chi nhánh…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm tài khoản demo" />
      </InputGroup>
      <Form.Check type="switch" id="demo-ready" className="mb-2 text-muted" checked={onlyReady} onChange={(e) => setOnlyReady(e.target.checked)} label="Chỉ hiện tài khoản có mật khẩu demo" />

      {/* Tab: Chung + từng chi nhánh (ẩn khi đang tìm - kết quả lấy từ mọi tab) */}
      {!q.trim() && (
        <Nav variant="pills" className="flex-nowrap overflow-auto gap-1 mb-2 pb-1" activeKey={current} onSelect={(k) => setTab(k)} style={{ scrollbarWidth: 'thin' }}>
          {tabs.map(([key, label, n]) => (
            <Nav.Item key={key}>
              <Nav.Link eventKey={key} className="py-1 px-2 text-nowrap small">
                {key === COMMON ? <Globe2 className="me-1" /> : <Shop className="me-1" />}{label} <span className="opacity-75">({n})</span>
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
      )}
      {q.trim() && <div className="text-muted mb-2">Kết quả tìm trên tất cả chi nhánh</div>}

      <div className="demo-accounts-list">
        {groups.map(([label, list]) => (
          <div key={label} className="mb-2">
            <div className="fw-semibold text-body mt-1">{label} <span className="text-muted fw-normal">({list.length})</span></div>
            {list.map((a) => (
              <button key={a.email} type="button" className="demo-account" disabled={!a.password} title={a.password ? 'Bấm để điền vào ô đăng nhập' : 'Mật khẩu riêng - không phải tài khoản demo'}
                onClick={() => onPick({ email: a.email, password: a.password })}>
                <span className="d-block text-truncate"><span className="text-body fw-medium">{a.name}</span>{a.title && <span className="text-muted"> · {a.title}</span>}</span>
                <span className="d-block text-truncate text-muted">
                  {a.email}{a.password ? <> / <code>{a.password}</code></> : <> · <KeyFill /> mật khẩu riêng</>}
                  {/* Trong tab chi nhánh: đánh dấu người làm thêm (chi nhánh chính ở nơi khác) */}
                  {current !== COMMON && !q.trim() && a.store && a.store !== current && <> · <Badge bg="info" className="fw-normal">làm thêm · CN chính {a.store}</Badge></>}
                  {(current === COMMON || q.trim()) && a.store && <> · <Shop size={10} /> {a.store}</>}
                  {(current === COMMON || q.trim()) && a.extraStores.length > 0 && <> +{a.extraStores.length} CN</>}
                </span>
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <div className="text-muted">Không có tài khoản phù hợp</div>}
      </div>
      {data.total > data.staff.length && <div className="text-muted mt-1">Đang hiện {data.staff.length}/{data.total} tài khoản nhân viên - dùng ô tìm kiếm để lọc.</div>}
    </div>
  );
}
