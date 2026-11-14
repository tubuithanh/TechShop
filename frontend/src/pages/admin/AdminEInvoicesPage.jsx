import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, InputGroup, Modal, Nav, Row, Spinner, Table } from 'react-bootstrap';
import { FileEarmarkText, Search, Printer, Envelope, XCircle, ArrowRepeat, Lightning, Download, HourglassSplit, PatchCheck, CashStack, Receipt, ExclamationTriangle, Send, Clipboard, Check2 } from 'react-bootstrap-icons';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import { downloadCsv } from '../../utils/csvExport';
import EInvoiceDraftModal from '../../components/admin/EInvoiceDraftModal';
import api from '../../services/api';
import EInvoiceView from '../../components/EInvoiceView';
import AdminPagination from '../../components/admin/AdminPagination';

const vnd = (v) => (v ?? 0).toLocaleString('vi-VN') + 'đ';
const pad = (n) => String(n || 0).padStart(8, '0');
const STATUS_MAP = { issued: ['Đã phát hành', 'success'], cancelled: ['Đã hủy', 'danger'], replaced: ['Bị thay thế', 'secondary'] };
// Không bao giờ trả undefined (tránh trắng trang nếu gặp dữ liệu lạ)
const STATUS = new Proxy(STATUS_MAP, { get: (t, k) => t[k] || [String(k || '—'), 'secondary'] });

// Cửa sổ xem / in hóa đơn + thao tác (gửi email, hủy, thay thế)
export function EInvoiceModal({ id, onHide, onChanged }) {
  const [inv, setInv] = useState(null);
  const [mode, setMode] = useState(''); // '' | cancel | replace | email
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/einvoices/${id}`).then((r) => setInv(r.data.data)).catch((e) => setError(e.response?.data?.message || 'Không tải được')), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (path, body, msg) => {
    setBusy(true); setError('');
    try { const r = await api.post(`/einvoices/${id}/${path}`, body); setMode(''); onChanged?.(path === 'email' ? `Đang gửi hóa đơn tới ${r.data.data.emailQueuedTo}` : msg, r.data.data); if (path === 'replace') onHide(r.data.data._id); else { load(); if (path === 'email') setTimeout(load, 4000); } }
    catch (e) { setError(e.response?.data?.message || 'Không thực hiện được'); } finally { setBusy(false); }
  };
  const print = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Hóa đơn ${inv.series}-${pad(inv.number)}</title><style>${document.getElementById('einvoice-print-css')?.textContent || ''}</style></head><body>${document.querySelector('.einvoice').outerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  return (
    <Modal show onHide={() => onHide()} size="xl" scrollable>
      <Modal.Header closeButton><Modal.Title className="fs-5"><FileEarmarkText className="me-2" />Hóa đơn {inv && `${inv.template}${inv.series} - số ${pad(inv.number)}`}</Modal.Title></Modal.Header>
      <Modal.Body className="bg-body-tertiary">
        {error && <Alert variant="danger">{error}</Alert>}
        {!inv ? <Spinner /> : <EInvoiceView inv={inv} />}
      </Modal.Body>
      {inv && (
        <Modal.Footer className="flex-column align-items-stretch">
          {mode === 'cancel' && (
            <div className="d-flex gap-2">
              <Form.Control placeholder="Lý do hủy (VD: khách trả hàng toàn bộ, lập trùng hóa đơn...)" value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button variant="danger" disabled={busy} onClick={() => run('cancel', { reason: form.reason }, 'Đã hủy hóa đơn')}>Xác nhận hủy</Button>
            </div>
          )}
          {mode === 'replace' && (
            <div>
              <div className="small text-muted mb-1">Lập hóa đơn mới thay thế (số mới), hóa đơn này chuyển "bị thay thế". Sửa thông tin người mua nếu sai:</div>
              <Row className="g-2">
                {[['name', 'Họ tên người mua'], ['companyName', 'Tên đơn vị'], ['taxCode', 'Mã số thuế'], ['address', 'Địa chỉ'], ['email', 'Email nhận hóa đơn']].map(([k, label]) => (
                  <Col md={k === 'address' ? 12 : 6} key={k}><Form.Control size="sm" placeholder={label} value={form.buyer?.[k] ?? inv.buyer?.[k] ?? ''} onChange={(e) => setForm({ ...form, buyer: { ...(form.buyer || {}), [k]: e.target.value } })} /></Col>
                ))}
                <Col md={9}><Form.Control size="sm" placeholder="Lý do thay thế (VD: sai mã số thuế người mua)" value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Col>
                <Col md={3}><Button size="sm" className="w-100" disabled={busy} onClick={() => run('replace', { reason: form.reason, buyer: form.buyer }, 'Đã lập hóa đơn thay thế')}>Lập hóa đơn thay thế</Button></Col>
              </Row>
            </div>
          )}
          {mode === 'email' && (
            <div className="d-flex gap-2">
              <Form.Control type="email" placeholder="Email người mua" value={form.email ?? inv.buyer?.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Button disabled={busy} onClick={() => run('email', { email: form.email ?? inv.buyer?.email }, 'Đã gửi hóa đơn qua email')}>Gửi</Button>
            </div>
          )}
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            {inv.emailedAt && <span className="small text-muted me-auto align-self-center">Đã gửi {inv.emailedTo} lúc {new Date(inv.emailedAt).toLocaleString('vi-VN')}</span>}
            <Button variant="outline-secondary" onClick={print}><Printer className="me-1" />In / Lưu PDF</Button>
            <Button variant="outline-primary" onClick={() => setMode(mode === 'email' ? '' : 'email')}><Envelope className="me-1" />Gửi email</Button>
            {inv.status === 'issued' && <Button variant="outline-warning" onClick={() => setMode(mode === 'replace' ? '' : 'replace')}><ArrowRepeat className="me-1" />Thay thế</Button>}
            {inv.status === 'issued' && <Button variant="outline-danger" onClick={() => setMode(mode === 'cancel' ? '' : 'cancel')}><XCircle className="me-1" />Hủy</Button>}
          </div>
        </Modal.Footer>
      )}
    </Modal>
  );
}

// QUẢN LÝ HÓA ĐƠN ĐIỆN TỬ (giả lập): tab Chờ xuất / Đã phát hành / Cần xử lý / Đã hủy / Bị thay thế,
// chọn kỳ nhanh, lọc chi nhánh, phát hành từng đơn (xem trước) hoặc hàng loạt, xuất bảng kê CSV
const PERIODS = (() => {
  const now = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const y = now.getFullYear(); const m = now.getMonth();
  return [
    ['month', 'Tháng này', iso(new Date(y, m, 1)), ''],
    ['last', 'Tháng trước', iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    ['quarter', 'Quý này', iso(new Date(y, Math.floor(m / 3) * 3, 1)), ''],
    ['year', 'Năm nay', iso(new Date(y, 0, 1)), ''],
    ['all', 'Tất cả', '', '']
  ];
})();
const TABS = [
  ['pending', 'Chờ xuất', 'pendingOrders', 'warning'],
  ['issued', 'Đã phát hành', 'issued', 'success'],
  ['attention', 'Cần xử lý', 'attention', 'danger'],
  ['cancelled', 'Đã hủy', 'cancelled', 'secondary'],
  ['replaced', 'Bị thay thế', 'replaced', 'secondary'],
  ['all', 'Tất cả hóa đơn', null, 'dark']
];

function CopyCode({ code }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn btn-link btn-sm p-0 text-muted text-decoration-none" title="Sao chép mã tra cứu"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(code).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); }).catch(() => {}); }}>
      {ok ? <Check2 className="text-success" /> : <Clipboard />} {code}
    </button>
  );
}

export default function AdminEInvoicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('pending');
  const [period, setPeriod] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState([]);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0, amount: 0 });
  const [selected, setSelected] = useState([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [drafting, setDrafting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => { if (isAdmin) storeService.getStores().then(setStores).catch(() => {}); }, [isAdmin]);
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [qInput]);
  const params = useMemo(() => Object.fromEntries(Object.entries({ q, from: range.from, to: range.to, storeId, page }).filter(([, v]) => v !== '' && v != null)), [q, range, storeId, page]);

  // Số liệu tổng (luôn tải) + danh sách theo tab
  const load = useCallback(async () => {
    setRows(null); setSelected([]);
    try {
      const head = await api.get('/einvoices', { params: { ...params, page: 1, limit: tab === 'pending' ? 1 : 20, ...(tab !== 'pending' && tab !== 'all' ? { status: tab } : {}), ...(tab !== 'pending' ? { page } : {}) } });
      setSummary(head.data.summary);
      if (tab === 'pending') {
        const r = await api.get('/einvoices/pending-orders', { params });
        setRows(r.data.data); setMeta({ total: r.data.total, totalPages: r.data.totalPages, amount: r.data.amount });
      } else { setRows(head.data.data); setMeta({ total: head.data.total, totalPages: head.data.totalPages }); }
    } catch (e) { setRows([]); setNotice({ tone: 'danger', text: e.response?.data?.message || 'Không tải được' }); }
  }, [params, tab, page]);
  useEffect(() => { load(); }, [load]);

  const pickPeriod = (key) => { const p = PERIODS.find((x) => x[0] === key); setPeriod(key); setRange({ from: p[2], to: p[3] }); setPage(1); };
  // Đổi tab: xóa danh sách cũ NGAY (đơn hàng của tab Chờ xuất khác dạng dữ liệu hóa đơn)
  const switchTab = (k) => { if (k === tab) return; setRows(null); setSelected([]); setMeta({ total: 0, totalPages: 0, amount: 0 }); setTab(k); setPage(1); };

  const bulk = async (ids) => {
    const n = ids ? ids.length : summary?.pendingOrders;
    if (!window.confirm(`Phát hành hóa đơn cho ${n} đơn${ids ? ' đã chọn' : ' đủ điều kiện (tối đa 200/lần)'}?${sendEmail ? ' Hóa đơn sẽ được gửi email cho khách có email.' : ''}`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/einvoices/bulk-issue', { orderIds: ids, sendEmail, storeId: storeId || undefined });
      const d = data.data;
      setNotice({ tone: d.failed ? 'warning' : 'success', text: `Đã phát hành ${d.issued} hóa đơn${d.emailed ? `, gửi email ${d.emailed}` : ''}${d.failed ? `. ${d.failed} đơn lỗi: ${d.errors.join('; ')}` : ''}${d.remaining ? '. Còn đơn chưa xuất - bấm lại để tiếp tục.' : ''}` });
      load();
    } catch (e) { setNotice({ tone: 'danger', text: e.response?.data?.message || 'Phát hành thất bại' }); } finally { setBusy(false); }
  };

  // Bảng kê hóa đơn (CSV mở bằng Excel) theo bộ lọc hiện tại
  const exportCsv = async () => {
    setBusy(true);
    try {
      const all = [];
      for (let p = 1; p <= 50; p++) {
        const { data } = await api.get('/einvoices', { params: { ...params, page: p, limit: 200, ...(tab !== 'pending' && tab !== 'all' ? { status: tab } : {}) } });
        all.push(...data.data);
        if (p >= data.totalPages) break;
      }
      if (!all.length) return setNotice({ tone: 'warning', text: 'Không có hóa đơn để xuất bảng kê' });
      downloadCsv(`bang-ke-hoa-don-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Ký hiệu', 'Số hóa đơn', 'Ngày lập', 'Người mua', 'Đơn vị', 'MST người mua', 'Tiền chưa thuế', 'Tiền thuế GTGT', 'Tổng thanh toán', 'Trạng thái', 'Mã CQT', 'Mã tra cứu', 'Mã đơn hàng'],
        all.map((x) => [`${x.template}${x.series}`, pad(x.number), new Date(x.issuedAt).toLocaleDateString('vi-VN'), x.buyer?.name, x.buyer?.companyName, x.buyer?.taxCode, x.totals?.net, x.totals?.vat, x.totals?.total, STATUS[x.status][0], x.taxAuthorityCode, x.lookupCode, x.orderCode]));
    } catch (e) { setNotice({ tone: 'danger', text: e.response?.data?.message || 'Xuất bảng kê thất bại' }); } finally { setBusy(false); }
  };

  const s = summary;
  const allIds = (rows || []).map((o) => o._id);
  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
        <h1 className="fs-4 fw-bold mb-0"><FileEarmarkText className="me-2 text-success" />Hóa đơn điện tử</h1>
        <Badge bg="warning" text="dark">Giả lập</Badge>
        <div className="ms-auto d-flex gap-2">
          <Button variant="outline-secondary" disabled={busy || tab === 'pending'} onClick={exportCsv} title={tab === 'pending' ? 'Chọn tab hóa đơn để xuất bảng kê' : ''}><Download className="me-1" />Xuất bảng kê</Button>
          {s?.pendingOrders > 0 && <Button variant="success" disabled={busy} onClick={() => bulk()}><Lightning className="me-1" />{busy ? 'Đang xử lý…' : `Phát hành tất cả ${s.pendingOrders} đơn chờ`}</Button>}
        </div>
      </div>
      <div className="small text-muted mb-3">Mô phỏng hóa đơn GTGT có mã của cơ quan thuế (NĐ 123/2020, TT 78/2021). Không gửi lên cơ quan thuế thật.</div>
      {notice && <Alert variant={notice.tone} dismissible onClose={() => setNotice(null)} className="py-2">{notice.text}</Alert>}

      {/* Số liệu */}
      {s && (
        <div className="einv-kpis mb-3">
          {[
            ['pending', 'Chờ xuất hóa đơn', s.pendingOrders, 'đơn đã giao, đã thu tiền', s.pendingOrders ? 'warning' : 'success', HourglassSplit],
            ['issued', 'Đã phát hành', s.issued, `hóa đơn đang hiệu lực`, 'success', PatchCheck],
            [null, 'Doanh thu chưa thuế', vnd(s.issuedNet), `tổng thanh toán ${vnd(s.issuedTotal)}`, 'primary', CashStack],
            [null, 'Thuế GTGT đầu ra', vnd(s.issuedVat), 'trên hóa đơn đang hiệu lực', 'info', Receipt],
            ['attention', 'Cần xử lý', s.attention, s.attention ? 'đơn đã trả / hoàn tiền' : 'không có', s.attention ? 'danger' : 'secondary', ExclamationTriangle]
          ].map(([k, label, value, sub, tone, Icon]) => (
            <button key={label} type="button" disabled={!k} onClick={() => k && switchTab(k)} className={`einv-kpi border-${tone} ${tab === k ? 'active' : ''}`}>
              <Icon className={`text-${tone} fs-4`} />
              <span className="text-start"><span className="d-block small text-muted">{label}</span><span className="d-block fs-5 fw-bold lh-sm">{value}</span><span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>{sub}</span></span>
            </button>
          ))}
        </div>
      )}

      {/* Bộ lọc */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <InputGroup style={{ maxWidth: 360 }}><InputGroup.Text><Search /></InputGroup.Text><Form.Control placeholder={tab === 'pending' ? 'Mã đơn, tên / SĐT khách' : 'Số HĐ, mã đơn, mã tra cứu, tên / MST'} value={qInput} onChange={(e) => setQInput(e.target.value)} /></InputGroup>
        <div className="btn-group btn-group-sm">
          {PERIODS.map(([k, label]) => <Button key={k} variant={period === k ? 'primary' : 'outline-secondary'} onClick={() => pickPeriod(k)}>{label}</Button>)}
        </div>
        <Form.Control size="sm" type="date" style={{ width: 'auto' }} value={range.from} onChange={(e) => { setPeriod(''); setRange({ ...range, from: e.target.value }); setPage(1); }} aria-label="Từ ngày" />
        <Form.Control size="sm" type="date" style={{ width: 'auto' }} value={range.to} onChange={(e) => { setPeriod(''); setRange({ ...range, to: e.target.value }); setPage(1); }} aria-label="Đến ngày" />
        {isAdmin && stores.length > 1 && (
          <Form.Select size="sm" style={{ width: 'auto' }} value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }} aria-label="Chi nhánh">
            <option value="">Tất cả chi nhánh</option>{stores.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
          </Form.Select>
        )}
      </div>

      {/* Tab */}
      <Nav variant="tabs" activeKey={tab} onSelect={switchTab} className="mb-0 einv-tabs">
        {TABS.map(([k, label, key, tone]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k}>{label}{key && s && <Badge bg={tone} text={tone === 'warning' ? 'dark' : undefined} className="ms-1">{s[key]}</Badge>}</Nav.Link></Nav.Item>
        ))}
      </Nav>

      <Card className="shadow-sm border-top-0 rounded-top-0">
        {tab === 'pending' && rows?.length > 0 && (
          <div className={`einv-bulk ${selected.length ? 'active' : ''}`}>
            <Form.Check id="einv-all" label={selected.length ? `Đã chọn ${selected.length}` : `Chọn tất cả ${rows.length} đơn trong trang`} checked={selected.length === rows.length} onChange={() => setSelected(selected.length === rows.length ? [] : allIds)} />
            <Form.Check type="switch" id="einv-email" label="Gửi email cho khách" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <Button size="sm" variant="success" className="ms-auto" disabled={!selected.length || busy} onClick={() => bulk(selected)}><Send className="me-1" />Phát hành {selected.length || ''} đơn đã chọn</Button>
            <span className="small text-muted">Tổng giá trị chờ xuất: <b>{vnd(meta.amount)}</b></span>
          </div>
        )}
        <Table hover responsive className="mb-0 align-middle einv-table">
          {tab === 'pending' ? (
            <>
              <thead><tr className="text-muted"><th style={{ width: 36 }} /><th>Đơn hàng</th><th>Ngày đặt</th><th>Người mua</th><th>Email nhận HĐ</th><th className="text-end">Tổng tiền</th><th /></tr></thead>
              <tbody>
                {!rows && <tr><td colSpan={7} className="text-center p-4"><Spinner size="sm" /></td></tr>}
                {rows?.map((o) => (
                  <tr key={o._id} className={selected.includes(o._id) ? 'table-active' : ''}>
                    <td><Form.Check aria-label={`Chọn ${o.orderCode}`} checked={selected.includes(o._id)} onChange={() => setSelected(selected.includes(o._id) ? selected.filter((x) => x !== o._id) : [...selected, o._id])} /></td>
                    <td><b>{o.orderCode}</b><div className="small text-muted">{o.source === 'pos' ? 'Tại quầy' : 'Online'} · {o.storeId?.name}</div></td>
                    <td className="small">{new Date(o.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td>{o.invoiceInfo?.companyName ? <><Badge bg="info" className="fw-normal me-1">Công ty</Badge>{o.invoiceInfo.companyName}<div className="small text-muted">MST {o.invoiceInfo.taxCode}</div></> : <>{o.deliveryAddress?.fullName || 'Khách lẻ'}<div className="small text-muted">{o.deliveryAddress?.phone}</div></>}</td>
                    <td className="small">{o.buyerEmail || <span className="text-muted">— chưa có</span>}</td>
                    <td className="text-end fw-semibold">{vnd(o.grandTotal)}</td>
                    <td className="text-end"><Button size="sm" variant="success" onClick={() => setDrafting(o._id)}>Xem trước & xuất</Button></td>
                  </tr>
                ))}
                {rows && !rows.length && <tr><td colSpan={7} className="text-center text-muted p-5"><PatchCheck size={28} className="text-success d-block mx-auto mb-2" />Không còn đơn nào chờ xuất hóa đơn trong phạm vi đang xem</td></tr>}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr className="text-muted"><th>Ký hiệu - Số</th><th>Ngày lập</th><th>Người mua</th><th>Đơn hàng</th><th className="text-end">Chưa thuế</th><th className="text-end">Thuế GTGT</th><th className="text-end">Tổng tiền</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {!rows && <tr><td colSpan={8} className="text-center p-4"><Spinner size="sm" /></td></tr>}
                {rows?.filter((x) => x.series).map((x) => (
                  <tr key={x._id} role="button" onClick={() => setViewing(x._id)} className={x.needsAttention ? 'einv-row-attention' : ''}>
                    <td><b>{x.template}{x.series}</b> · <span className="font-monospace">{pad(x.number)}</span>{x.type === 'replacement' && <Badge bg="info" className="ms-1 fw-normal">Thay thế</Badge>}<div className="small"><CopyCode code={x.lookupCode} /></div></td>
                    <td className="small">{new Date(x.issuedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}<div className="text-muted">{x.issuedByName}</div></td>
                    <td>{x.buyer?.companyName ? <><Badge bg="info" className="fw-normal me-1">Công ty</Badge>{x.buyer.companyName}<div className="small text-muted">MST {x.buyer.taxCode}</div></> : <>{x.buyer?.name}<div className="small text-muted">Cá nhân</div></>}</td>
                    <td className="small">{x.orderCode}</td>
                    <td className="text-end small">{vnd(x.totals?.net)}</td>
                    <td className="text-end small">{vnd(x.totals?.vat)}</td>
                    <td className="text-end fw-semibold">{vnd(x.totals?.total)}</td>
                    <td>
                      <Badge bg={STATUS[x.status][1]}>{STATUS[x.status][0]}</Badge>
                      {x.needsAttention && <div className="small text-danger fw-semibold"><ExclamationTriangle className="me-1" />Đơn đã trả / hoàn tiền - cần hủy</div>}
                      <div className="small text-muted">{x.emailedAt ? <><Envelope className="me-1" />đã gửi email</> : x.status === 'issued' ? 'chưa gửi email' : ''}</div>
                    </td>
                  </tr>
                ))}
                {rows && !rows.length && <tr><td colSpan={8} className="text-center text-muted p-5">Không có hóa đơn nào trong mục này</td></tr>}
              </tbody>
            </>
          )}
        </Table>
        {meta.totalPages > 1 && <Card.Body className="pt-2"><AdminPagination page={page} totalPages={meta.totalPages} total={meta.total} onChange={setPage} /></Card.Body>}
      </Card>
      {viewing && <EInvoiceModal id={viewing} onHide={(nextId) => { setViewing(nextId || null); load(); }} onChanged={(text) => { setNotice({ tone: 'success', text }); load(); }} />}
      {drafting && <EInvoiceDraftModal orderId={drafting} onHide={() => setDrafting(null)} onIssued={(inv) => { setDrafting(null); setNotice({ tone: 'success', text: `Đã phát hành hóa đơn số ${pad(inv.number)}${(inv.emailQueuedTo || inv.emailedTo) ? ` · đang gửi email tới ${inv.emailQueuedTo || inv.emailedTo}` : ''}` }); setViewing(inv._id); load(); }} />}
    </div>
  );
}
