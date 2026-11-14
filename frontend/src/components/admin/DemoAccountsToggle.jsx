import { useEffect, useState } from 'react';
import { Alert, Card, Form } from 'react-bootstrap';
import { PersonBadge } from 'react-bootstrap-icons';
import api from '../../services/api';

// Bật / tắt danh sách tài khoản demo ở trang đăng nhập (lấy từ database, chỉ hiện mật khẩu demo đã xác minh)
export default function DemoAccountsToggle() {
  const [state, setState] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.get('/settings/demo-accounts').then((r) => setState(r.data.data)).catch(() => {}); }, []);
  if (!state) return null;
  const toggle = async (enabled) => {
    try { const r = await api.put('/settings/demo-accounts', { enabled }); setState(r.data.data); setMsg({ variant: 'success', text: r.data.message }); }
    catch (e) { setMsg({ variant: 'danger', text: e.response?.data?.message || 'Không lưu được' }); }
  };
  return (
    <Card className="mt-4">
      <Card.Body>
        <div className="fw-semibold mb-1"><PersonBadge className="me-2" />Tài khoản demo ở trang đăng nhập</div>
        <div className="small text-muted mb-2">Hiện danh sách tài khoản quản trị / nhân viên đang hoạt động để đăng nhập thử. Mật khẩu chỉ hiện với tài khoản dùng mật khẩu demo công khai (admin123, nhanvien123...).</div>
        {msg && <Alert variant={msg.variant} className="py-2 small" dismissible onClose={() => setMsg(null)}>{msg.text}</Alert>}
        <Form.Check type="switch" id="demo-toggle" checked={state.enabled} onChange={(e) => toggle(e.target.checked)} label={state.enabled ? 'Đang hiển thị trên trang đăng nhập' : 'Đang ẩn'} />
        {state.production && state.enabled && <Alert variant="warning" className="py-2 small mt-2 mb-0">Website đang chạy production: ai cũng thấy danh sách tài khoản và mật khẩu demo. Chỉ bật khi demo / chấm đồ án, tắt khi dùng thật.</Alert>}
        {!state.configured && <div className="small text-muted mt-1">Chưa cấu hình: mặc định {state.production ? 'TẮT trên production' : 'BẬT khi chạy local'}.</div>}
      </Card.Body>
    </Card>
  );
}
