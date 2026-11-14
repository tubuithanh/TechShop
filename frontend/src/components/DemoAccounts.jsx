import { useEffect, useMemo, useState } from 'react';
import { Badge, Form, InputGroup } from 'react-bootstrap';
import { Search, PersonBadge, Shop, KeyFill } from 'react-bootstrap-icons';
import api from '../services/api';

const GROUPS = [
  ['admin', 'Quản trị viên'], ['manager', 'Quản lý'], ['sales', 'Bán hàng / CSKH'], ['warehouse', 'Kho'],
  ['delivery', 'Giao hàng'], ['warranty', 'Kỹ thuật bảo hành'], ['other', 'Khác'], ['customer', 'Khách hàng']
];

// TÀI KHOẢN DEMO trên trang đăng nhập: lấy từ máy chủ (tài khoản quản trị / nhân viên đang hoạt động).
// Mật khẩu chỉ hiện khi máy chủ xác minh đúng là mật khẩu demo. Bấm 1 dòng để điền sẵn vào form.
export default function DemoAccounts({ onPick }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [onlyReady, setOnlyReady] = useState(true);
  useEffect(() => { api.get('/auth/demo-accounts').then((r) => setData(r.data.data)).catch(() => setData({ enabled: false })); }, []);

  const groups = useMemo(() => {
    if (!data?.enabled) return [];
    const k = q.trim().toLowerCase();
    const all = [...data.customers, ...data.staff].filter((a) => (!onlyReady || a.password) && (!k || `${a.name} ${a.email} ${a.title} ${a.store} ${a.extraStores.join(' ')}`.toLowerCase().includes(k)));
    return GROUPS.map(([key, label]) => [label, all.filter((a) => a.kind === key)]).filter(([, list]) => list.length);
  }, [data, q, onlyReady]);

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
                  {a.store && <> · <Shop size={10} /> {a.store}</>}{a.extraStores.length > 0 && <> +{a.extraStores.length} CN</>}
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
