import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Nav, Spinner, Alert } from 'react-bootstrap';
import { TicketPerforated, Clock, Lock, ClockHistory, Copy, Check2, PiggyBank, Gem } from 'react-bootstrap-icons';
import api from '../../services/api';

const vnd = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const date = (d) => new Date(d).toLocaleDateString('vi-VN');
const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000));
const headline = (v) => (v.discountType === 'percent' ? `Giảm ${v.discountValue}%` : `Giảm ${vnd(v.discountValue)}`);

function VoucherCard({ v, kind }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(v.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* trình duyệt chặn clipboard */ }
  };
  const locked = kind === 'locked';
  const scope = [
    v.categories?.length ? `Danh mục: ${v.categories.map((c) => c.name).join(', ')}` : '',
    v.products?.length ? `Sản phẩm: ${v.products.map((p) => p.title).slice(0, 3).join(', ')}${v.products.length > 3 ? '…' : ''}` : '',
    v.stores?.length ? `Chỉ tại: ${v.stores.join(', ')}` : ''
  ].filter(Boolean);
  // Link "Dùng ngay": tới đúng danh mục / sản phẩm của mã, không thì về trang chủ
  const shopLink = v.products?.length === 1 ? `/products/${v.products[0].slug}` : v.categories?.length ? `/products?categoryId=${v.categories[0]._id}` : '/products';
  return (
    <div className={`voucher-ticket ${locked ? 'locked' : ''} ${kind === 'expiring' ? 'expiring' : ''}`}>
      <div className="voucher-ticket-left">
        {locked ? <Lock size={22} /> : <TicketPerforated size={22} />}
        <div className="fw-bold mt-1 text-center lh-sm">{v.discountType === 'percent' ? `${v.discountValue}%` : vnd(v.discountValue).replace('.000đ', 'K')}</div>
      </div>
      <div className="voucher-ticket-body">
        <div className="d-flex flex-wrap align-items-center gap-1">
          <span className="fw-semibold">{headline(v)}{v.maxDiscountAmount && v.discountType === 'percent' ? ` tối đa ${vnd(v.maxDiscountAmount)}` : ''}</span>
          {v.tiers?.length > 0 && <Badge bg="warning" text="dark" className="fw-normal"><Gem size={10} className="me-1" />{v.tiers.join(' / ')}</Badge>}
          {kind === 'expiring' && <Badge bg="danger" className="fw-normal">Còn {daysLeft(v.endDate)} ngày</Badge>}
          {v.remaining != null && v.remaining <= 10 && <Badge bg="dark" className="fw-normal">Chỉ còn {v.remaining} lượt</Badge>}
        </div>
        {v.description && <div className="small text-muted">{v.description}</div>}
        <div className="small text-muted">
          {v.minOrderValue > 0 ? `Đơn tối thiểu ${vnd(v.minOrderValue)}` : 'Không yêu cầu đơn tối thiểu'}
          {v.myUsesLeft != null && ` · Bạn còn ${v.myUsesLeft} lượt`}
        </div>
        {scope.map((s) => <div key={s} className="small text-muted text-truncate">{s}</div>)}
        <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
          <code className="voucher-code">{v.code}</code>
          {!locked && kind !== 'upcoming' && (
            <>
              <Button size="sm" variant="outline-secondary" onClick={copy}>{copied ? <><Check2 className="me-1" />Đã chép</> : <><Copy className="me-1" />Sao chép</>}</Button>
              <Button size="sm" variant="danger" as={Link} to={shopLink}>Dùng ngay</Button>
            </>
          )}
          <span className="small text-muted ms-auto">
            {kind === 'upcoming' ? `Bắt đầu ${date(v.startDate)}` : locked ? `Mở khóa khi lên hạng ${v.unlockTier}` : `HSD ${date(v.endDate)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  ['ready', 'Dùng được ngay', TicketPerforated],
  ['expiring', 'Sắp hết hạn', Clock],
  ['upcoming', 'Sắp diễn ra', ClockHistory],
  ['locked', 'Mở khóa khi lên hạng', Lock],
  ['used', 'Đã dùng', PiggyBank]
];

// VÍ VOUCHER của khách: cá nhân hóa theo hạng thành viên, số lượt đã dùng, lịch sử tiết kiệm
export default function MyVouchersPage() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('ready');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/vouchers/mine').then((r) => {
      setData(r.data.data);
      if (!r.data.data.ready.length && r.data.data.expiring.length) setTab('expiring');
    }).catch((e) => setError(e.response?.data?.message || 'Không tải được mã giảm giá'));
  }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) return <Spinner animation="border" />;
  const usable = data.ready.length + data.expiring.length;

  return (
    <div style={{ maxWidth: '52rem' }}>
      <h1 className="fs-4 fw-bold mb-3">Mã giảm giá của tôi</h1>
      <div className="voucher-summary mb-3">
        <div><div className="small text-muted">Mã dùng được</div><div className="fs-4 fw-bold text-danger">{usable}</div></div>
        <div><div className="small text-muted">Hạng thành viên</div><div className="fs-5 fw-bold">{data.tier?.name || '—'}</div></div>
        <div><div className="small text-muted">Đã tiết kiệm nhờ mã</div><div className="fs-5 fw-bold text-success">{vnd(data.totalSaved)}</div></div>
        {data.locked.length > 0 && <div><div className="small text-muted">Chờ mở khóa</div><div className="fs-5 fw-bold">{data.locked.length} mã <Link to="/account/loyalty" className="small fw-normal">Xem hạng</Link></div></div>}
      </div>
      {data.expiring.length > 0 && tab !== 'expiring' && (
        <Alert variant="warning" className="py-2 small" role="button" onClick={() => setTab('expiring')}>⏰ Bạn có {data.expiring.length} mã sắp hết hạn trong 3 ngày tới - dùng ngay kẻo lỡ!</Alert>
      )}
      <Nav variant="tabs" activeKey={tab} onSelect={setTab} className="mb-3 flex-nowrap overflow-auto">
        {TABS.map(([k, label, Icon]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k} className="text-nowrap"><Icon className="me-1" />{label} <Badge bg="light" text="dark" className="border">{data[k].length}</Badge></Nav.Link></Nav.Item>
        ))}
      </Nav>

      {tab === 'used' ? (
        data.used.length ? (
          <div className="d-flex flex-column gap-2">
            {data.used.map((u) => (
              <div key={u.code} className="border rounded-3 p-3 d-flex flex-wrap align-items-center gap-2">
                <code className="voucher-code">{u.code}</code>
                <span className="small text-muted">Dùng {u.times} lần · gần nhất {date(u.lastUsedAt)}</span>
                <span className="small">{u.orders.map((o) => <Link key={o._id} to={`/account/orders/${o._id}`} className="me-2">#{o.code}</Link>)}</span>
                <span className="ms-auto fw-bold text-success">Tiết kiệm {vnd(u.saved)}</span>
              </div>
            ))}
          </div>
        ) : <div className="text-muted small p-3">Bạn chưa dùng mã giảm giá nào.</div>
      ) : data[tab].length ? (
        <div className="d-flex flex-column gap-2">{data[tab].map((v) => <VoucherCard key={v.code} v={v} kind={tab} />)}</div>
      ) : (
        <div className="text-muted small p-3">
          {tab === 'locked' ? 'Bạn đã mở khóa mọi ưu đãi theo hạng 🎉' : tab === 'upcoming' ? 'Chưa có chương trình sắp diễn ra.' : 'Không có mã ở mục này.'}
        </div>
      )}
      <div className="small text-muted mt-3">Mã được gợi ý và tự áp dụng ở bước Thanh toán khi giỏ hàng đủ điều kiện.</div>
    </div>
  );
}
