import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Form, InputGroup, Spinner, Dropdown } from 'react-bootstrap';
import { Search, Upc, PersonPlus, PersonCheck, XLg, Dash, Plus, Trash, Cash, Bank, PauseCircle, Receipt, Lightning, Keyboard, BagCheck, CartX, TicketPerforated, CheckCircleFill } from 'react-bootstrap-icons';
import api from '../../services/api';
import { storeService } from '../../services/storeService';
import { useAuth } from '../../store/AuthContext';
import { money } from '../../utils/orderWorkflow';
import { placeholderImage } from '../../utils/placeholderImage';
import OrderReceipt from '../../components/admin/OrderReceipt';
import VatBreakdown from '../../components/VatBreakdown';

const HOLD_KEY = 'pos.heldCarts'; // đơn lưu tạm (trong trình duyệt của quầy)
const readHeld = () => { try { return JSON.parse(localStorage.getItem(HOLD_KEY) || '[]'); } catch { return []; } };
const writeHeld = (list) => { try { localStorage.setItem(HOLD_KEY, JSON.stringify(list)); } catch { /* bộ nhớ trình duyệt bị chặn */ } };
const PHONE_RE = /^(0|\+84)(3|5|7|8|9)\d{8}$/; // số di động Việt Nam

// Gợi ý mệnh giá khách đưa: đúng số tiền + làm tròn lên các mốc 50k / 100k / 500k / 1tr
function cashSuggestions(total) {
  if (!total) return [];
  const ups = [50000, 100000, 500000, 1000000].map((step) => Math.ceil(total / step) * step); // làm tròn lên từng mệnh giá
  return [...new Set([total, ...ups])].filter((v) => v >= total).slice(0, 5); // bỏ trùng, tối đa 5 gợi ý
}

// BÁN HÀNG TẠI QUẦY: lưới sản phẩm (tìm / quét mã / lọc danh mục) + giỏ hàng cố định bên phải,
// tự tính tiền (khuyến mãi, voucher, VAT), tiền khách đưa & tiền thừa, lưu tạm đơn, phím tắt, ca bán hôm nay.
export default function AdminPosPage() {
  const { user } = useAuth();
  const scoped = user?.role === 'staff' && user?.storeId; // nhân viên: khóa vào chi nhánh đang làm
  const [storeId, setStoreId] = useState(scoped ? (user.storeId._id || user.storeId) : '');
  const [stores, setStores] = useState([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [items, setItems] = useState([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [fullName, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [voucherCode, setVoucher] = useState('');
  const [paymentMode, setPayment] = useState('cash');
  const [cashGiven, setCashGiven] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [quote, setQuote] = useState(null);
  const [requote, setRequote] = useState(0); // tăng lên -> tính lại tiền sau khi thanh toán lỗi
  const [today, setToday] = useState(null);
  const [held, setHeld] = useState(readHeld);
  const [flash, setFlash] = useState('');
  // Nhận diện khách theo SĐT + tạo thẻ thành viên cho khách mới
  const [phoneInfo, setPhoneInfo] = useState(null);
  const [createAccount, setCreateAccount] = useState(true);
  const [email, setEmail] = useState('');
  const [welcome, setWelcome] = useState(null);
  // Mã giảm giá khách dùng được cho giỏ hiện tại (tính sẵn số tiền giảm), tự áp mã có lợi nhất
  const [offers, setOffers] = useState(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const manualVoucher = useRef(false); // thu ngân tự chọn / bỏ mã -> không tự đổi nữa
  const request = useRef(null); // yêu cầu thanh toán đang chờ kết quả (giữ nguyên khi thử lại)
  const inFlight = useRef(false); // chặn bấm thanh toán 2 lần
  const searchRef = useRef(null);
  const customerRef = useRef(null);
  const payRef = useRef(null);
  const locked = busy || Boolean(request.current); // khóa sửa giỏ khi đang / chưa rõ kết quả thanh toán

  useEffect(() => { storeService.getStores().then(setStores).catch(() => setError('Không tải được chi nhánh')); }, []);
  const loadToday = useCallback(() => api.get('/orders/pos/today').then((r) => setToday(r.data.data)).catch(() => {}), []);
  useEffect(() => { loadToday(); }, [loadToday, receipt]); // xong 1 đơn -> cập nhật doanh số ca

  // Danh mục sản phẩm còn hàng tại chi nhánh
  useEffect(() => {
    let live = true;
    if (!storeId) { setCatalog([]); return undefined; }
    setLoadingCatalog(true);
    const timer = setTimeout(() => api.get('/orders/pos/catalog', { params: { storeId, q } }) // chờ 250ms sau khi gõ mới tìm
      .then((r) => live && setCatalog(r.data.data))
      .catch(() => live && setError('Không tải được tồn kho'))
      .finally(() => live && setLoadingCatalog(false)), 250);
    return () => { live = false; clearTimeout(timer); };
  }, [storeId, q, receipt]);

  useEffect(() => {
    let live = true;
    if (customerQuery.trim().length < 3) { setCustomers([]); return undefined; } // gõ ít nhất 3 ký tự mới tìm khách
    const timer = setTimeout(() => api.get('/orders/pos/customers', { params: { q: customerQuery } }).then((r) => live && setCustomers(r.data.data)).catch(() => live && setCustomers([])), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [customerQuery]);

  const categories = useMemo(() => {
    const map = new Map();
    for (const p of catalog) if (p.category) map.set(p.category, (map.get(p.category) || 0) + 1); // đếm sản phẩm theo danh mục
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [catalog]);
  const shown = category ? catalog.filter((p) => p.category === category) : catalog;
  const inCart = useMemo(() => new Map(items.map((i) => [i.variantId, i.quantity])), [items]); // số lượng đã có trong giỏ theo phiên bản

  // Tự tính tiền (khuyến mãi, voucher, VAT) mỗi khi giỏ / khách / voucher đổi
  useEffect(() => {
    setQuote(null); setQuoteError('');
    if (!items.length || !storeId) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const r = await api.post('/orders/pos/quote', { clientRequestId: crypto.randomUUID(), storeId, userId: customer?._id, fullName, phone, paymentMode, voucherCode, items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) }); // backend tính tiền (khuyến mãi, mã, VAT) - không tạo đơn
        if (live) setQuote(r.data.data);
      } catch (err) {
        if (live) setQuoteError(err.response?.data?.message || 'Không tính được tổng tiền');
      } finally { if (live) setQuoting(false); }
    }, 450); // chờ 450ms sau thay đổi cuối mới tính
    return () => { live = false; clearTimeout(timer); };
  }, [storeId, items, voucherCode, customer, requote]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 1500); };
  const add = (product) => {
    const cur = inCart.get(product.variantId) || 0;
    if (cur >= product.stock) return showFlash(`Chỉ còn ${product.stock} sản phẩm "${product.title}"`); // không vượt tồn kho
    setItems((old) => {
      const found = old.find((x) => x.variantId === product.variantId);
      if (found) return old.map((x) => (x.variantId === product.variantId ? { ...x, quantity: Math.min(x.stock, x.quantity + 1) } : x));
      return [...old, { ...product, quantity: 1 }];
    });
    showFlash(`+1 ${product.title} · ${product.label}`);
  };
  const setQty = (variantId, qty) => setItems((old) => old.flatMap((x) => (x.variantId !== variantId ? [x] : qty <= 0 ? [] : [{ ...x, quantity: Math.min(x.stock, Math.min(100, qty)) }]))); // qty <= 0 -> bỏ dòng; tối đa tồn kho và 100
  const clearCart = () => { setPhoneInfo(null); setCreateAccount(true); setEmail(''); setItems([]); setVoucher(''); setCashGiven(''); setNote(''); setCustomer(null); setName(''); setPhone(''); setCustomerQuery(''); };

  // Quét mã / Enter: thêm ngay kết quả đầu tiên (máy quét mã vạch gõ tên + Enter)
  const onSearchKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (shown[0]) { add(shown[0]); setQ(''); } } // máy quét mã vạch: gõ mã + Enter -> thêm ngay
    if (e.key === 'Escape') setQ('');
  };

  // Gõ đủ SĐT -> tra ngay: thành viên thì tự chọn, khách cũ / khách mới thì gợi ý tạo thẻ thành viên
  useEffect(() => {
    // SỬA LỖI: trước đây /s/g (xóa chữ "s") thay vì /\s/g (xóa khoảng trắng) -> nhập "090 123 4567" không bao giờ tra được
    const p = phone.replace(/\s/g, '');
    if (customer || !PHONE_RE.test(p)) { setPhoneInfo(null); return undefined; } // đã chọn khách / SĐT chưa đủ -> không tra
    let live = true;
    const t = setTimeout(() => api.get('/orders/pos/lookup-phone', { params: { phone: p } }).then((r) => {
      if (!live) return;
      const info = r.data.data;
      if (info.status === 'member') { pickCustomer(info.customer); showFlash('Đã nhận diện thành viên ' + info.customer.displayName); return; } // thành viên -> tự chọn
      setPhoneInfo(info);
      if (info.status === 'returning' && !fullName.trim()) setName(info.guest.name || '');
    }).catch(() => {}), 300);
    return () => { live = false; clearTimeout(t); };
  }, [phone, customer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!customer || !items.length || !storeId) { setOffers(null); return undefined; }
    let live = true;
    const t = setTimeout(() => api.post('/orders/pos/vouchers', { storeId, userId: customer._id, items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) })
      .then((r) => {
        if (!live) return;
        const data = r.data.data;
        setOffers(data);
        const best = data.eligible[0]; // mã có lợi nhất
        const current = voucherCode.trim().toUpperCase();
        const stillOk = !current || data.eligible.some((v) => v.code === current); // mã đang áp còn dùng được?
        if (!manualVoucher.current && best && current !== best.code) { setVoucher(best.code); showFlash('Đã tự áp mã ' + best.code + ' (−' + money(best.amount) + ')'); }
        else if (!stillOk && !showCodeInput) { setVoucher(best?.code || ''); if (best) showFlash('Mã cũ không còn dùng được, đổi sang ' + best.code); }
      })
      .catch(() => live && setOffers(null)), 400);
    return () => { live = false; clearTimeout(t); };
  }, [customer, items, storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseVoucher = (code) => { manualVoucher.current = true; setVoucher(code); };

  const pickCustomer = (c) => {
    manualVoucher.current = false; setVoucher('');
    setCustomer(c); setName(c.displayName || ''); setPhone(c.phoneNumber || ''); setCustomerQuery(''); setCustomers([]);
  };

  // Lưu tạm đơn (khách đi lấy thêm đồ, thanh toán sau)
  const holdCart = () => {
    if (!items.length) return;
    const next = [{ id: Date.now(), at: new Date().toISOString(), storeId, items, customer, fullName, phone, voucherCode, note }, ...held].slice(0, 10); // tối đa 10 đơn lưu tạm
    setHeld(next); writeHeld(next); clearCart(); showFlash('Đã lưu tạm đơn');
  };
  const resumeCart = (h) => {
    if (items.length && !window.confirm('Giỏ hiện tại sẽ được lưu tạm để mở đơn này?')) return;
    const rest = held.filter((x) => x.id !== h.id);
    const next = items.length ? [{ id: Date.now(), at: new Date().toISOString(), storeId, items, customer, fullName, phone, voucherCode, note }, ...rest] : rest;
    setHeld(next); writeHeld(next);
    setStoreId(scoped ? storeId : h.storeId); setItems(h.items); setCustomer(h.customer); setName(h.fullName); setPhone(h.phone); setVoucher(h.voucherCode || ''); setNote(h.note || ''); // nhân viên không đổi được chi nhánh
  };
  const dropHeld = (id) => { const next = held.filter((x) => x.id !== id); setHeld(next); writeHeld(next); };

  const total = quote?.grandTotal ?? items.reduce((s, i) => s + i.price * i.quantity, 0); // ưu tiên số backend tính
  const given = Number(String(cashGiven).replace(/\D/g, '')) || 0; // tiền khách đưa (bỏ dấu chấm, chữ)
  const change = given - total; // tiền thối
  const phoneOk = PHONE_RE.test(phone.replace(/\s/g, ''));
  // Khách lẻ không cần tên/SĐT; nhập SĐT thì phải đúng. Không nhập tiền khách đưa = khách đưa đủ
  const phoneValid = !phone.trim() || phoneOk;
  const ready = items.length && quote && phoneValid && (!customer || phoneOk) && (paymentMode !== 'cash' || !given || given >= total); // đủ điều kiện bấm thanh toán

  const submit = async (e) => {
    e?.preventDefault();
    if (inFlight.current || !ready) return; // đang gửi / chưa đủ điều kiện
    inFlight.current = true; setBusy(true); setError('');
    if (!request.current) request.current = { clientRequestId: crypto.randomUUID(), storeId, userId: customer?._id || null, fullName: fullName.trim() || 'Khách lẻ', phone: phone.replace(/\s/g, ''), paymentMode, paymentConfirmed: true, voucherCode, ...(!customer && phoneInfo && phoneOk && createAccount ? { createAccount: true, accountConsent: true, email: email.trim() || undefined } : {}), note: [note, paymentMode === 'cash' && given ? `Khách đưa ${money(given)}, thối ${money(Math.max(0, change))}` : ''].filter(Boolean).join(' · '), expectedTotal: quote?.grandTotal, expectedVatRate: quote?.vat?.rate, expectedVatFingerprint: quote?.vatFingerprint, items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) }; // mã yêu cầu duy nhất: lỗi mạng bấm lại -> gửi ĐÚNG mã cũ, backend không tạo đơn trùng
    try {
      const result = await api.post('/orders/pos', request.current); // tạo đơn + trừ kho + thu tiền
      setReceipt({ ...result.data.data, storeId: stores.find((s) => s._id === storeId) || { name: user?.storeId?.name }, cashGiven: given, change: Math.max(0, change) });
      if (result.data.data.newAccount) setWelcome({ name: fullName, ...result.data.data.newAccount });
      request.current = null; clearCart(); searchRef.current?.focus(); // xong -> giỏ mới, con trỏ về ô tìm hàng
    } catch (err) {
      setError(err.response?.data?.message || 'Chưa rõ kết quả. Bấm thử lại để kiểm tra cùng yêu cầu, không tạo đơn trùng.');
      if ([400, 403, 404, 409, 503].includes(err.response?.status)) { request.current = null; setRequote((n) => n + 1); } // tính lại tiền (giá / tồn kho có thể đã đổi)
    } finally { inFlight.current = false; setBusy(false); }
  };

  // Phím tắt: F2 tìm hàng, F4 tìm khách, F8 lưu tạm, F9 thanh toán
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); } // F2: tìm hàng
      else if (e.key === 'F4') { e.preventDefault(); customerRef.current?.focus(); }
      else if (e.key === 'F8') { e.preventDefault(); holdCart(); }
      else if (e.key === 'F9') { e.preventDefault(); submit(); } // F9: thanh toán
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const storeHeld = held.filter((h) => !storeId || h.storeId === storeId);

  return (
    <div className="pos-page">
      {/* Thanh trên: chi nhánh, ca hôm nay, đơn lưu tạm */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="fs-4 fw-bold mb-0 me-2">Bán hàng tại quầy</h1>
        <Form.Select size="sm" style={{ width: 'auto' }} value={storeId} disabled={Boolean(scoped) || locked} onChange={(e) => { setStoreId(e.target.value); setItems([]); }} aria-label="Chi nhánh">
          <option value="">Chọn chi nhánh</option>
          {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </Form.Select>
        {today && (
          <div className="d-flex gap-2 small ms-lg-2">
            <Badge bg="primary-subtle" text="primary-emphasis" className="fw-normal px-2 py-2">Hôm nay: <b>{today.orders}</b> đơn</Badge>
            <Badge bg="success-subtle" text="success-emphasis" className="fw-normal px-2 py-2">Doanh thu: <b>{money(today.revenue)}</b></Badge>
            <Badge bg="secondary-subtle" text="secondary-emphasis" className="fw-normal px-2 py-2 d-none d-md-inline">Tiền mặt trong két: <b>{money(today.cash)}</b></Badge>
          </div>
        )}
        <div className="ms-auto d-flex gap-2">
          <Dropdown align="end">
            <Dropdown.Toggle size="sm" variant={storeHeld.length ? 'warning' : 'outline-secondary'}><PauseCircle className="me-1" />Đơn chờ ({storeHeld.length})</Dropdown.Toggle>
            <Dropdown.Menu style={{ minWidth: 300 }}>
              {!storeHeld.length && <Dropdown.ItemText className="small text-muted">Chưa có đơn lưu tạm (F8 để lưu)</Dropdown.ItemText>}
              {storeHeld.map((h) => (
                <div key={h.id} className="d-flex align-items-center px-3 py-2 border-bottom gap-2">
                  <div className="flex-grow-1 small" role="button" onClick={() => resumeCart(h)}>
                    <div className="fw-medium">{h.fullName || 'Khách lẻ'} · {h.items.reduce((n, i) => n + i.quantity, 0)} sp</div>
                    <div className="text-muted">{money(h.items.reduce((s, i) => s + i.price * i.quantity, 0))} · {new Date(h.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <Button size="sm" variant="link" className="text-danger p-0" onClick={() => dropHeld(h.id)} aria-label="Xóa đơn chờ"><XLg /></Button>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          {today?.recent?.length > 0 && (
            <Dropdown align="end">
              <Dropdown.Toggle size="sm" variant="outline-secondary"><Receipt className="me-1" />Đơn vừa bán</Dropdown.Toggle>
              <Dropdown.Menu style={{ minWidth: 300 }}>
                {today.recent.map((o) => (
                  <Dropdown.Item key={o._id} href={`/admin/orders?q=${o.orderCode}`} className="small">
                    <div className="d-flex justify-content-between"><b>#{o.orderCode}</b><span>{money(o.grandTotal)}</span></div>
                    <div className="text-muted text-truncate">{new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {o.deliveryAddress?.fullName} · {o.items?.[0]?.name}</div>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}
        </div>
      </div>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <div className="pos-layout">
        {/* ============ TRÁI: SẢN PHẨM ============ */}
        <section className="pos-products">
          <InputGroup className="mb-2">
            <InputGroup.Text><Search /></InputGroup.Text>
            <Form.Control ref={searchRef} autoFocus placeholder="Tìm tên sản phẩm hoặc quét mã… (F2) — Enter để thêm kết quả đầu" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} disabled={!storeId} aria-label="Tìm sản phẩm" />
            <InputGroup.Text title="Hỗ trợ máy quét mã vạch"><Upc /></InputGroup.Text>
          </InputGroup>
          {categories.length > 1 && (
            <div className="pos-chips mb-2">
              <button type="button" className={`btn btn-sm rounded-pill ${!category ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setCategory('')}>Tất cả ({catalog.length})</button>
              {categories.map(([name, n]) => <button key={name} type="button" className={`btn btn-sm rounded-pill ${category === name ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setCategory(category === name ? '' : name)}>{name} ({n})</button>)}
            </div>
          )}
          {!storeId ? <Alert variant="light" className="border">Chọn chi nhánh để bắt đầu bán hàng.</Alert> : (
            <div className="pos-grid">
              {loadingCatalog && !catalog.length && <Spinner size="sm" />}
              {!loadingCatalog && !shown.length && <div className="text-muted small p-3">Không tìm thấy sản phẩm còn hàng</div>}
              {shown.map((p, idx) => {
                const qty = inCart.get(p.variantId) || 0;
                const out = qty >= p.stock;
                return (
                  <button key={p.variantId} type="button" className={`pos-card ${qty ? 'in-cart' : ''}`} onClick={() => add(p)} disabled={out || locked} title={`${p.title} · ${p.label}`}>
                    {qty > 0 && <span className="pos-card-qty">{qty}</span>}
                    {idx < 3 && !q && !category && p.soldCount > 0 && <span className="pos-card-hot"><Lightning size={10} />Bán chạy</span>}
                    <img src={p.image || placeholderImage(120, 120)} alt="" loading="lazy" />
                    <div className="pos-card-title">{p.title}</div>
                    <div className="pos-card-variant">{p.label}</div>
                    <div className="pos-card-price">{money(p.price)}{p.originalPrice && <s className="ms-1">{money(p.originalPrice)}</s>}</div>
                    <div className={`pos-card-stock ${p.stock <= 3 ? 'text-danger fw-semibold' : ''}`}>{out ? 'Đã lấy hết' : `Còn ${p.stock - qty}`}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ============ PHẢI: GIỎ HÀNG & THANH TOÁN ============ */}
        <Form onSubmit={submit} className="pos-cart">
          <fieldset disabled={locked} className="d-flex flex-column h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="fw-bold">Giỏ hàng {items.length > 0 && <Badge bg="primary" pill>{items.reduce((n, i) => n + i.quantity, 0)}</Badge>}</div>
              <div className="d-flex gap-1">
                <Button size="sm" variant="outline-warning" disabled={!items.length} onClick={holdCart} title="Lưu tạm (F8)"><PauseCircle /></Button>
                <Button size="sm" variant="outline-danger" disabled={!items.length} onClick={() => window.confirm('Xóa toàn bộ giỏ hàng?') && clearCart()} title="Xóa giỏ"><CartX /></Button>
              </div>
            </div>

            <div className="pos-cart-items">
              {!items.length && <div className="text-center text-muted small py-4"><BagCheck size={28} className="mb-2 opacity-50 d-block mx-auto" />Bấm vào sản phẩm bên trái để thêm vào giỏ</div>}
              {items.map((i) => (
                <div key={i.variantId} className="pos-line">
                  <img src={i.image || placeholderImage(48, 48)} alt="" />
                  <div className="flex-grow-1 min-w-0">
                    <div className="small fw-medium text-truncate">{i.title}</div>
                    <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>{i.label} · {money(i.price)}</div>
                    <div className="d-flex align-items-center gap-1 mt-1">
                      <Button size="sm" variant="outline-secondary" className="pos-step" onClick={() => setQty(i.variantId, i.quantity - 1)} aria-label="Giảm"><Dash /></Button>
                      <Form.Control size="sm" className="text-center" style={{ width: 46 }} value={i.quantity} onChange={(e) => setQty(i.variantId, Number(e.target.value.replace(/\D/g, '')) || 1)} aria-label="Số lượng" />
                      <Button size="sm" variant="outline-secondary" className="pos-step" disabled={i.quantity >= i.stock} onClick={() => setQty(i.variantId, i.quantity + 1)} aria-label="Tăng"><Plus /></Button>
                      {i.quantity >= i.stock && <span className="text-danger" style={{ fontSize: '0.7rem' }}>tối đa</span>}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="fw-semibold small">{money(i.price * i.quantity)}</div>
                    <Button size="sm" variant="link" className="text-danger p-0" onClick={() => setQty(i.variantId, 0)} aria-label="Bỏ"><Trash size={13} /></Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Khách hàng */}
            <div className="pos-block">
              {customer ? (
                <div className="d-flex align-items-center gap-2">
                  <PersonCheck className="text-success" size={20} />
                  <div className="flex-grow-1 small">
                    <div className="fw-semibold">{customer.displayName} <span className="text-muted fw-normal">· {customer.phoneNumber}</span></div>
                    <div className="text-muted">{customer.orders ? `Khách quen · ${customer.orders} đơn · ${money(customer.spent)}` : 'Khách có tài khoản'}{quote?.tier && <> · Hạng <b>{quote.tier.name}</b></>}</div>
                  </div>
                  <Button size="sm" variant="link" className="text-muted p-0" onClick={() => { setCustomer(null); setVoucher(''); }} aria-label="Bỏ chọn khách"><XLg /></Button>
                </div>
              ) : (
                <div className="position-relative">
                  <InputGroup size="sm">
                    <InputGroup.Text><PersonPlus /></InputGroup.Text>
                    <Form.Control ref={customerRef} placeholder="Tìm khách theo SĐT / email / tên (F4)" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} aria-label="Tìm khách hàng" />
                  </InputGroup>
                  {customers.length > 0 && (
                    <div className="pos-suggest shadow">
                      {customers.map((c) => (
                        <button key={c._id} type="button" className="dropdown-item small" onClick={() => pickCustomer(c)}>
                          <div className="fw-medium">{c.displayName} <span className="text-muted">· {c.phoneNumber}</span></div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>{c.email}{c.orders ? ` · ${c.orders} đơn đã mua` : ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="d-flex gap-2 mt-2">
                <Form.Control size="sm" placeholder="Tên khách (trống = Khách lẻ)" maxLength={120} value={fullName} onChange={(e) => setName(e.target.value)} aria-label="Tên khách" />
                <Form.Control size="sm" placeholder="SĐT (để tích điểm)" type="tel" value={phone} isInvalid={phone.length > 0 && !phoneOk} onChange={(e) => setPhone(e.target.value)} aria-label="Số điện thoại" style={{ maxWidth: 140 }} />
              </div>
              {!customer && phoneInfo && (
                <div className={`pos-newcustomer mt-2 ${phoneInfo.status}`}>
                  <div className="small fw-semibold">
                    {phoneInfo.status === 'returning'
                      ? <>🔁 Khách cũ chưa có tài khoản · đã mua {phoneInfo.guest.orders} lần ({money(phoneInfo.guest.spent)})</>
                      : <>✨ Khách mới - lần đầu mua tại TechShop</>}
                  </div>
                  <Form.Check type="switch" id="pos-create-account" className="small mt-1" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)}
                    label={phoneInfo.status === 'returning' ? 'Tạo thẻ thành viên & gộp ' + phoneInfo.guest.orders + ' đơn cũ (đã hỏi ý khách)' : 'Tạo thẻ thành viên: tích điểm + sổ bảo hành (đã hỏi ý khách)'} />
                  {createAccount && <Form.Control size="sm" type="email" className="mt-1" placeholder="Email khách (không bắt buộc - để nhận hóa đơn & tự đặt mật khẩu)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email khách" />}
                </div>
              )}
              {customer && (
                <div className="pos-offers mt-2">
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="small fw-semibold"><TicketPerforated className="me-1 text-danger" />Mã giảm giá của khách {offers && <span className="text-muted fw-normal">({offers.total} mã dùng được{offers.total > 3 ? ', hiện 3 mã lợi nhất' : ''})</span>}</span>
                    <Button size="sm" variant="link" className="p-0 small" onClick={() => setShowCodeInput((v) => !v)}>{showCodeInput ? 'Ẩn' : 'Nhập mã khác'}</Button>
                  </div>
                  {showCodeInput && <Form.Control size="sm" className="mt-1 text-uppercase" placeholder="Nhập mã voucher" value={voucherCode} onChange={(e) => chooseVoucher(e.target.value)} aria-label="Voucher" />}
                  {!items.length && <div className="small text-muted">Thêm sản phẩm để xem mã áp dụng được</div>}
                  {offers && !offers.eligible.length && !offers.nearly.length && <div className="small text-muted">Khách chưa có mã nào dùng được cho giỏ này</div>}
                  {offers?.eligible.map((v, i) => {
                    const on = voucherCode.trim().toUpperCase() === v.code;
                    return (
                      <div key={v.code} role="button" onClick={() => chooseVoucher(on ? '' : v.code)} className={'pos-offer ' + (on ? 'active' : '')}>
                        <div className="flex-grow-1 min-w-0">
                          <div className="small fw-bold">{v.code} {i === 0 && <Badge bg="danger" className="fw-normal ms-1">Tốt nhất</Badge>}{v.forTier && <Badge bg="warning" text="dark" className="fw-normal ms-1">Hạng thành viên</Badge>}</div>
                          <div className="text-muted text-truncate" style={{ fontSize: '0.72rem' }}>
                            {v.description || (v.discountType === 'percent' ? 'Giảm ' + v.discountValue + '%' + (v.maxDiscountAmount ? ' tối đa ' + money(v.maxDiscountAmount) : '') : 'Giảm ' + money(v.discountValue))}
                            {v.limited && ' · áp dụng một số sản phẩm'} · HSD {new Date(v.endDate).toLocaleDateString('vi-VN')}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold text-success small">−{money(v.amount)}</div>
                          <div style={{ fontSize: '0.72rem' }}>{on ? <span className="text-success"><CheckCircleFill className="me-1" />Đang dùng</span> : <span className="text-primary">Áp dụng</span>}</div>
                        </div>
                      </div>
                    );
                  })}
                  {offers?.nearly.map((v) => (
                    <div key={v.code} className="small text-muted mt-1">💡 Mua thêm <b className="text-danger">{money(v.missing)}</b> để dùng mã <b>{v.code}</b> ({v.discountType === 'percent' ? 'giảm ' + v.discountValue + '%' : 'giảm ' + money(v.discountValue)})</div>
                  ))}
                </div>
              )}
            </div>

            {/* Tổng tiền */}
            <div className="pos-block">
              <div className="d-flex justify-content-between small"><span>Tạm tính</span><span>{money(quote?.itemsTotal ?? items.reduce((s, i) => s + i.price * i.quantity, 0))}</span></div>
              {(quote?.promotions || []).map((p) => <div key={p.promotionId} className="d-flex justify-content-between small text-success"><span>KM: {p.name}</span><span>−{money(p.amount)}</span></div>)}
              {quote?.voucherDiscount > 0 && <div className="d-flex justify-content-between small text-success"><span>Voucher {voucherCode.toUpperCase()}</span><span>−{money(quote.voucherDiscount)}</span></div>}
              {quoteError && <div className="small text-danger">{quoteError}</div>}
              <div className="d-flex justify-content-between align-items-center mt-1">
                <span className="fw-semibold">Khách cần trả {quoting && <Spinner size="sm" className="ms-1" />}</span>
                <span className="pos-total">{money(total)}</span>
              </div>
              {quote && <details className="small text-muted"><summary>Chi tiết VAT</summary><VatBreakdown vat={quote.vat} /></details>}
            </div>

            {/* Thanh toán */}
            <div className="pos-block">
              <div className="btn-group w-100 mb-2" role="group" aria-label="Hình thức thanh toán">
                <Button variant={paymentMode === 'cash' ? 'primary' : 'outline-primary'} onClick={() => { setPayment('cash'); }}><Cash className="me-1" />Tiền mặt</Button>
                <Button variant={paymentMode === 'bank_transfer' ? 'primary' : 'outline-primary'} onClick={() => { setPayment('bank_transfer'); }}><Bank className="me-1" />Chuyển khoản</Button>
              </div>
              {paymentMode === 'cash' ? (
                <>
                  <InputGroup size="sm">
                    <InputGroup.Text>Khách đưa</InputGroup.Text>
                    <Form.Control inputMode="numeric" value={cashGiven ? Number(String(cashGiven).replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => { setCashGiven(e.target.value.replace(/\D/g, '')); }} placeholder="0" aria-label="Tiền khách đưa" />
                    <InputGroup.Text>đ</InputGroup.Text>
                  </InputGroup>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {cashSuggestions(total).map((v) => <Button key={v} size="sm" variant={given === v ? 'secondary' : 'outline-secondary'} className="py-0" onClick={() => { setCashGiven(String(v)); }}>{v === total ? 'Đủ tiền' : money(v)}</Button>)}
                  </div>
                  {given > 0 && (
                    <div className={`d-flex justify-content-between mt-2 fw-semibold ${change >= 0 ? 'text-success' : 'text-danger'}`}>
                      <span>{change >= 0 ? 'Tiền thừa trả khách' : 'Còn thiếu'}</span><span className="fs-5">{money(Math.abs(change))}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="small text-muted">Kiểm tra app ngân hàng đã nhận <b>{money(total)}</b> trước khi hoàn tất.</div>
              )}
              <Form.Control size="sm" as="textarea" rows={1} className="mt-2" placeholder="Ghi chú đơn (không bắt buộc)" maxLength={900} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
            </div>

            <Button ref={payRef} type="submit" size="lg" variant="success" className="w-100 mt-auto pos-pay" disabled={busy || !ready}>
              {busy ? <><Spinner size="sm" className="me-2" />Đang lưu…</>
                : request.current ? 'Thử lại cùng yêu cầu'
                : <>Thanh toán {money(total)} <small className="opacity-75">(F9)</small></>}
            </Button>
            {!ready && items.length > 0 && !busy && (
              <div className="small text-muted text-center mt-1">
                {!quote ? 'Đang tính tiền…' : !phoneValid ? 'SĐT không hợp lệ (để trống nếu là khách lẻ)' : paymentMode === 'cash' && given < total ? 'Nhập số tiền khách đưa' : ''}
              </div>
            )}
          </fieldset>
        </Form>
      </div>

      <div className="small text-muted mt-2 d-none d-lg-block"><Keyboard className="me-1" />Phím tắt: <kbd>F2</kbd> tìm hàng · <kbd>Enter</kbd> thêm kết quả đầu · <kbd>F4</kbd> tìm khách · <kbd>F8</kbd> lưu tạm · <kbd>F9</kbd> thanh toán</div>
      {flash && <div className="pos-flash">{flash}</div>}
      {welcome && (
        <Alert variant="success" className="pos-welcome shadow" dismissible onClose={() => setWelcome(null)}>
          <div className="fw-semibold">🎉 Đã tạo thẻ thành viên cho {welcome.name}</div>
          <div className="small">Đơn này đã được tích điểm và lưu sổ bảo hành vào tài khoản.{welcome.linkedOrders > 0 && <> Gộp thêm <b>{welcome.linkedOrders}</b> đơn cũ (+{welcome.linkedPoints} điểm).</>}</div>
          <div className="small text-muted">{welcome.hasEmail ? 'Đã gửi email hướng dẫn khách tự đặt mật khẩu.' : 'Dặn khách: đăng ký online bằng SĐT này rồi vào Đơn hàng của tôi → "Thêm đơn mua tại cửa hàng" với mã đơn trên hóa đơn.'}</div>
        </Alert>
      )}
      {receipt && <OrderReceipt order={receipt} onHide={() => { setReceipt(null); searchRef.current?.focus(); }} />}
    </div>
  );
}
