import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Form, InputGroup, Alert, Collapse } from 'react-bootstrap';
import { Shop } from 'react-bootstrap-icons';
import api from '../services/api';

// Khách đã mua tại cửa hàng (chưa có tài khoản / có thẻ thành viên tạo tại quầy) gộp lịch sử vào tài khoản:
// nhập mã đơn trên hóa đơn; SĐT trên đơn phải trùng SĐT trong tài khoản -> chuyển đơn, điểm thưởng, sổ bảo hành.
export default function ClaimPosOrder({ onClaimed }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setResult(null);
    try {
      const { data } = await api.post('/users/claim-pos-order', { orderCode: code.trim() });
      setResult({ ok: true, message: data.data.message });
      setCode('');
      if (data.data.orders > 0) onClaimed?.();
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.message || 'Không thêm được đơn' });
    } finally { setBusy(false); }
  };

  return (
    <div className="mb-3">
      <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Shop className="me-1" />Đã mua tại cửa hàng? Thêm đơn vào tài khoản để tích điểm & tra bảo hành
      </Button>
      <Collapse in={open}>
        <div>
          <Form onSubmit={submit} className="border rounded-3 p-3 mt-2 bg-body-tertiary">
            <div className="small text-muted mb-2">
              Nhập <b>mã đơn</b> in trên hóa đơn mua tại cửa hàng. Số điện thoại trên hóa đơn phải trùng số điện thoại trong{' '}
              <Link to="/account/profile">Thông tin tài khoản</Link>. Mọi đơn mua tại cửa hàng cùng số điện thoại sẽ được thêm vào tài khoản.
            </div>
            <InputGroup size="sm">
              <Form.Control placeholder="VD: DH635602288040" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Mã đơn trên hóa đơn" />
              <Button type="submit" disabled={busy || !code.trim()}>{busy ? 'Đang kiểm tra...' : 'Thêm đơn'}</Button>
            </InputGroup>
            {result && <Alert variant={result.ok ? 'success' : 'warning'} className="small mt-2 mb-0 py-2">{result.message}</Alert>}
          </Form>
        </div>
      </Collapse>
    </div>
  );
}
