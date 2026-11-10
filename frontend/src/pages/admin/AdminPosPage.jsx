import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Table } from 'react-bootstrap';
import api from '../../services/api';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import { money } from '../../utils/orderWorkflow';
import OrderReceipt from '../../components/admin/OrderReceipt';
import VatBreakdown from '../../components/VatBreakdown';

export default function AdminPosPage() {
  const { user } = useAuth();
  const scoped = user?.role === 'staff' && user?.storeId;
  const [storeId, setStoreId] = useState(scoped ? (user.storeId._id || user.storeId) : '');
  const [stores, setStores] = useState([]), [q, setQ] = useState(''), [catalog, setCatalog] = useState([]), [items, setItems] = useState([]);
  const [customerQuery, setCustomerQuery] = useState(''), [customers, setCustomers] = useState([]), [customer, setCustomer] = useState(null);
  const [fullName, setName] = useState(''), [phone, setPhone] = useState(''), [voucherCode, setVoucher] = useState('');
  const [paymentMode, setPayment] = useState('cash'), [confirmed, setConfirmed] = useState(false), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(null);
  const [quote, setQuote] = useState(null);
  const request = useRef(null), inFlight = useRef(false);
  const locked = busy || Boolean(request.current);
  useEffect(() => { setQuote(null); setConfirmed(false); }, [storeId, items, voucherCode, customer]);
  const calculate = async () => {
    setBusy(true); setError('');
    try { const r = await api.post('/orders/pos/quote', { clientRequestId: crypto.randomUUID(), storeId, userId: customer?._id, fullName, phone, paymentMode, voucherCode, items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) }); setQuote(r.data.data); }
    catch (err) { setError(err.response?.data?.message || 'Không tính được tổng tiền'); }
    finally { setBusy(false); }
  };
  useEffect(() => { storeService.getStores().then(setStores).catch(() => setError('Không tải được chi nhánh')); }, []);
  useEffect(() => {
    let live = true;
    if (!storeId) { setCatalog([]); return; }
    const timer = setTimeout(() => api.get('/orders/pos/catalog', { params: { storeId, q } }).then(r => live && setCatalog(r.data.data)).catch(() => live && setError('Không tải được tồn kho')), 250);
    return () => { live = false; clearTimeout(timer); };
  }, [storeId, q, receipt]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => api.get('/orders/pos/customers', { params: { q: customerQuery } }).then(r => live && setCustomers(r.data.data)).catch(() => live && setCustomers([])), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [customerQuery]);
  const add = product => setItems(old => {
    const found = old.find(x => x.variantId === product.variantId);
    if (found) return old.map(x => x.variantId === product.variantId ? { ...x, quantity: Math.min(x.stock, x.quantity + 1) } : x);
    return [...old, { ...product, quantity: 1 }];
  });
  const submit = async e => {
    e.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    if (!request.current) request.current = { clientRequestId: crypto.randomUUID(), storeId, userId: customer?._id || null, fullName, phone, paymentMode, paymentConfirmed: confirmed, voucherCode, note, expectedTotal: quote?.grandTotal, expectedVatRate: quote?.vat?.rate, expectedVatFingerprint:quote?.vatFingerprint, items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) };
    try {
      const result = await api.post('/orders/pos', request.current);
      setReceipt({ ...result.data.data, storeId: stores.find(s => s._id === storeId) || { name: user?.storeId?.name } });
      request.current = null; setItems([]); setConfirmed(false); setVoucher('');
    } catch (err) {
      setError(err.response?.data?.message || 'Chưa rõ kết quả. Bấm thử lại để kiểm tra cùng yêu cầu, không tạo đơn trùng.');
      if ([400, 403, 404, 503].includes(err.response?.status)) { request.current = null; setQuote(null); setConfirmed(false); }
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <div><h3>Bán hàng tại quầy</h3>{error && <Alert variant="danger">{error}</Alert>}
    <Form onSubmit={submit}>
      <fieldset disabled={locked}>
        <Form.Label>Chi nhánh *</Form.Label><Form.Select required value={storeId} disabled={Boolean(scoped)} onChange={e => { setStoreId(e.target.value); setItems([]); }}><option value="">Chọn chi nhánh</option>{stores.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</Form.Select>
        <Card className="my-3"><Card.Body><Form.Label>Tìm sản phẩm còn hàng</Form.Label><Form.Control placeholder="Tên sản phẩm…" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: 240, overflow: 'auto' }}>{catalog.map(p => <div className="d-flex align-items-center justify-content-between border-bottom py-2 gap-2" key={p.variantId}><span>{p.title} · {p.label}<br /><small>{money(p.price)} · Tồn {p.stock}</small></span><Button size="sm" type="button" onClick={() => add(p)}>Thêm</Button></div>)}</div>
        </Card.Body></Card>
        <Table responsive><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Thành tiền</th><th /></tr></thead><tbody>{items.map(i => <tr key={i.variantId}><td>{i.title} · {i.label}</td><td><Form.Control style={{ width: 85 }} type="number" min={1} max={Math.min(i.stock, 100)} required value={i.quantity} onChange={e => setItems(items.map(x => x.variantId === i.variantId ? { ...x, quantity: Number(e.target.value) } : x))} /></td><td>{money(i.price * i.quantity)}</td><td><Button size="sm" variant="outline-danger" onClick={() => setItems(items.filter(x => x.variantId !== i.variantId))}>Bỏ</Button></td></tr>)}</tbody></Table>
        <p>Tiền hàng dự kiến: <strong>{money(items.reduce((sum,i) => sum + i.price * i.quantity, 0))}</strong> · Nhận tại quầy miễn phí giao hàng.</p>
        <Form.Label>Tìm tài khoản khách theo SĐT/email (không bắt buộc)</Form.Label><Form.Control value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="Nhập ít nhất 3 ký tự" />
        <Form.Select className="my-2" value={customer?._id || ''} onChange={e => { const selected = customers.find(c => c._id === e.target.value); setCustomer(selected || null); if (selected) { setName(selected.displayName); setPhone(selected.phoneNumber || ''); } else setVoucher(''); }}><option value="">Khách không có tài khoản</option>{customer && !customers.some(c => c._id === customer._id) && <option value={customer._id}>{customer.displayName}</option>}{customers.map(c => <option key={c._id} value={c._id}>{c.displayName} · {c.phoneNumber} · {c.email}</option>)}</Form.Select>
        {!customer && <div className="small text-muted mb-2">Lưu thông tin khách trên đơn. Khách chưa có tài khoản có thể mang mã đơn đến cửa hàng để tiếp nhận bảo hành; không áp dụng voucher theo tài khoản.</div>}
        <div className="row g-2"><Form.Group className="col-md-6"><Form.Label>Tên khách *</Form.Label><Form.Control required maxLength={120} value={fullName} onChange={e => setName(e.target.value)} /></Form.Group><Form.Group className="col-md-6"><Form.Label>Số điện thoại *</Form.Label><Form.Control required type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Form.Group></div>
        <Form.Label className="mt-2">Voucher</Form.Label><Form.Control disabled={!customer} value={voucherCode} onChange={e => setVoucher(e.target.value)} />
        <Form.Label className="mt-2">Thanh toán</Form.Label><Form.Select value={paymentMode} onChange={e => { setPayment(e.target.value); setConfirmed(false); }}><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản đã nhận</option></Form.Select>
        <Form.Label className="mt-2">Ghi chú</Form.Label><Form.Control as="textarea" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
        <Button type="button" className="my-2" variant="outline-primary" disabled={!items.length} onClick={calculate}>Tính tổng thanh toán</Button>
        {quote && <Alert variant="info">
          Tiền hàng {money(quote.itemsTotal)} − giảm {money(quote.discountAmount)} = <strong>Khách cần trả {money(quote.grandTotal)}</strong>
          {(quote.promotions || []).map((p) => <div key={p.promotionId} className="small">Khuyến mãi "{p.name}": −{money(p.amount)}</div>)}
          {quote.voucherDiscount > 0 && <div className="small">Mã {voucherCode.toUpperCase()}: −{money(quote.voucherDiscount)}</div>}
          {quote.tier && <div className="small text-muted">Hạng khách: {quote.tier.name}</div>}
        </Alert>}
        {quote && <VatBreakdown vat={quote.vat} />}
        <Form.Check className="my-3" required disabled={!quote} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} label={`Đã nhận đủ ${money(quote?.grandTotal)} và đã bàn giao hàng cho khách`} />
      </fieldset>
      <Button type="submit" disabled={busy || !items.length || (!quote && !request.current)}>{busy ? 'Đang lưu…' : request.current ? 'Thử lại cùng yêu cầu' : 'Hoàn tất bán hàng'}</Button>
    </Form>
    {receipt && <OrderReceipt order={receipt} onHide={() => setReceipt(null)} />}
  </div>;
}
