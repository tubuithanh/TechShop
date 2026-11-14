import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Card, Alert, Badge } from 'react-bootstrap';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { useSettings } from '../store/SettingsContext';
import { orderService } from '../services/orderService';
import { cartService } from '../services/cartService';
import { paymentService } from '../services/paymentService';
import api from '../services/api';
import LocationFields from '../components/LocationFields';
import VatBreakdown from '../components/VatBreakdown';
import { orderVat } from '../utils/vat';
import CheckoutSteps from '../components/CheckoutSteps';
import VoucherSuggestions from '../components/VoucherSuggestions';
import ExpressCheckout from '../components/ExpressCheckout';
import { voucherService } from '../services/voucherService';

// Mã số thuế: 10 số, 10 số-3 số (chi nhánh) hoặc 12 số (CCCD) - khớp kiểm tra ở backend (orderController)
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CheckoutPage() {
  const { cart, totalAmount, refreshCart } = useCart(); // giỏ hàng + tổng tạm tính
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [stores, setStores] = useState([]); // chi nhánh + đủ hàng hay không
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const savedAddresses = user?.addresses || []; // sổ địa chỉ của khách
  const defaultAddress = savedAddresses.find((a) => a.isDefault) || savedAddresses[0]; // địa chỉ mặc định (không có thì địa chỉ đầu)
  const [address, setAddress] = useState({
    fullName: user?.displayName || '',
    phone: user?.phoneNumber || '',
    addressLine1: defaultAddress?.addressLine1 || '',
    addressLine2: defaultAddress?.addressLine2 || '',
    city: defaultAddress?.city || '',
    state: defaultAddress?.state || '',
    pincode: defaultAddress?.pincode || ''
  });
  // Địa chỉ trong sổ địa chỉ đang chọn; 'new' = khách tự nhập địa chỉ khác
  const [addressChoice, setAddressChoice] = useState(defaultAddress?._id || 'new');
  const chooseAddress = (choice) => {
    setAddressChoice(choice);
    const a = savedAddresses.find((x) => x._id === choice); // 'new' -> không tìm thấy -> để trống cho khách nhập
    setAddress((cur) => ({
      ...cur,
      addressLine1: a?.addressLine1 || '',
      addressLine2: a?.addressLine2 || '',
      city: a?.city || '',
      state: a?.state || '',
      pincode: a?.pincode || ''
    }));
  };
  // Thông tin tài khoản tải xong SAU khi trang đã mở (tải lại trang) -> chọn sẵn địa chỉ mặc định
  useEffect(() => {
    if (defaultAddress && addressChoice === 'new' && !address.addressLine1) chooseAddress(defaultAddress._id); // chọn sẵn địa chỉ mặc định khi user vừa tải xong
    if (user && !address.fullName && !address.phone) {
      setAddress((cur) => ({ ...cur, fullName: user.displayName || '', phone: user.phoneNumber || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const [deliveryMethod, setDeliveryMethod] = useState('home_delivery');
  // Giao hỏa tốc đang chọn: { windowId, lat, lng, fee, store } (null = giao thường)
  const [express, setExpress] = useState(null);
  const [paymentMode, setPaymentMode] = useState('cod'); // mặc định trả tiền khi nhận hàng
  const [wantInvoice, setWantInvoice] = useState(false);
  const [invoice, setInvoice] = useState({ companyName: '', taxCode: '', address: '', email: '' });
  // Cổng thanh toán online đã cấu hình trên máy chủ (cổng chưa cấu hình thì ẩn lựa chọn)
  const [methods, setMethods] = useState({ vnpay: false, momo: false, momoLimits: { min: 1000, max: 50000000 } });
  useEffect(() => {
    paymentService
      .getMethods()
      .then(setMethods) // cổng nào dùng được
      .catch(() => setMethods((m) => ({ ...m, vnpay: false, momo: false })));
  }, []);
  const [voucherCode, setVoucherCode] = useState('');
  // Mã đã áp dụng thành công + bản xem trước tổng tiền do backend tính (khuyến mãi tự động, mã, VAT)
  const [appliedCode, setAppliedCode] = useState('');
  const [quote, setQuote] = useState(null); // tổng tiền do backend tính (nguồn chính xác)
  const [voucherMsg, setVoucherMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Chọn sẵn chi nhánh ĐỦ HÀNG cho cả giỏ (API xếp chi nhánh đủ hàng lên đầu); tải lại khi giỏ thay đổi
  const cartKey = (cart.items || []).map((i) => `${i.variantId}x${i.quantity}`).join(','); // chuỗi đại diện giỏ: giỏ đổi -> chuỗi đổi -> tính lại
  useEffect(() => {
    if (!cartKey) return;
    cartService
      .getStores()
      .then((data) => {
        setStores(data);
        setSelectedStoreId((cur) => (data.some((s) => s._id === cur && s.enough) ? cur : data[0]?._id || '')); // giữ chi nhánh đang chọn nếu vẫn đủ hàng, không thì chọn chi nhánh đầu (đủ hàng)
      })
      .catch(() => setStores([]));
  }, [cartKey]);
  const selectedStore = stores.find((s) => s._id === selectedStoreId);

  // Tính phí ship GIỐNG HỆT logic backend (orderController.js/createOrder) - trước đây trang này
  // hardcode 30.000đ, bỏ qua hoàn toàn ngưỡng miễn phí ship (freeShippingThreshold) admin đã cấu
  // hình, khiến khách nhìn thấy tổng tiền xem trước SAI (cao hơn số tiền thực sự bị tính khi đặt).
  const shippingFeeConfig = settings.defaultShippingFee ?? 30000;
  const freeShippingThreshold = settings.freeShippingThreshold ?? 0;
  const qualifiesFreeShipping = freeShippingThreshold > 0 && totalAmount >= freeShippingThreshold; // chỉ dùng tạm khi chưa có quote
  const localShippingFee = deliveryMethod === 'store_pickup' || qualifiesFreeShipping ? 0 : shippingFeeConfig;

  // Tính lại tổng tiền ở backend mỗi khi giỏ / chi nhánh / hình thức nhận hàng / mã thay đổi - khuyến mãi
  // có thể phụ thuộc chi nhánh và hạng thành viên nên không tự tính ở trình duyệt được.
  const useExpress = express && deliveryMethod === 'home_delivery'; // đang chọn giao hỏa tốc?
  const quoteRequest = (code) => orderService.quote({ storeId: (useExpress ? express.store._id : selectedStoreId) || undefined, deliveryMethod, voucherCode: code || undefined, expressWindowId: useExpress ? express.windowId : undefined }); // gọi POST /orders/quote
  useEffect(() => {
    if (!cartKey) return undefined;
    let alive = true; // bỏ kết quả về trễ khi lựa chọn đã đổi
    quoteRequest(appliedCode)
      .then((q) => { if (alive) setQuote(q); })
      .catch((err) => {
        if (!alive) return;
        // Mã không còn hợp lệ với lựa chọn mới (VD: đổi sang chi nhánh khác) -> bỏ mã, tính lại không có mã
        if (appliedCode) {
          setVoucherMsg(err.response?.data?.message || 'Mã giảm giá không còn áp dụng được');
          setAppliedCode('');
        } else {
          setQuote(null);
        }
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, selectedStoreId, deliveryMethod, appliedCode, express?.windowId]);

  const shippingFee = quote ? quote.shippingFee : localShippingFee;
  const promotionDiscount = quote?.promotionDiscount || 0;
  const voucherDiscount = quote?.voucherDiscount || 0;
  const discount = promotionDiscount + voucherDiscount;
  const grandTotal = quote ? quote.grandTotal : Math.round(Math.max(totalAmount + shippingFee, 0)); // ưu tiên số backend tính
  // MoMo giới hạn số tiền mỗi giao dịch (1.000đ - 50.000.000đ)
  const momoAllowed = grandTotal >= methods.momoLimits.min && grandTotal <= methods.momoLimits.max; // MoMo: 1.000đ - 50 triệu
  // Cổng đang chọn không còn dùng được (chưa cấu hình / vượt giới hạn) -> quay về COD
  useEffect(() => {
    if ((paymentMode === 'vnpay' && !methods.vnpay) || (paymentMode === 'momo' && (!methods.momo || !momoAllowed))) { // cổng không còn dùng được -> về COD
      setPaymentMode('cod');
    }
  }, [paymentMode, methods, momoAllowed]);

  // Gợi ý 3 mã có lợi nhất cho giỏ + chi nhánh hiện tại; tự áp mã tốt nhất nếu khách chưa tự chọn / nhập mã
  const [offers, setOffers] = useState(null);
  const [manualVoucher, setManualVoucher] = useState(false); // khách đã tự chọn mã -> không tự áp mã nữa
  useEffect(() => {
    if (!cartKey || user?.role !== 'customer') return undefined;
    let alive = true;
    const t = setTimeout(() => voucherService.suggest(selectedStoreId).then((d) => { // chờ 300ms (đổi chi nhánh liên tục chỉ gọi 1 lần)
      if (!alive) return;
      setOffers(d);
      const best = d.eligible[0]; // mã có lợi nhất
      if (best && !manualVoucher && appliedCode !== best.code) { // tự áp nếu khách chưa tự chọn
        setVoucherCode(best.code); setAppliedCode(best.code);
        setVoucherMsg(`Đã tự áp mã có lợi nhất ${best.code}: giảm ${formatVND(best.amount)}`);
      }
    }).catch(() => alive && setOffers(null)), 300);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, selectedStoreId, user?.role]);
  const pickOffer = (code) => {
    setManualVoucher(true);
    setVoucherCode(code); setAppliedCode(code);
    setVoucherMsg(code ? `Đã áp dụng mã ${code}` : 'Đã bỏ mã giảm giá');
  };

  const handleVoucherCodeChange = (value) => {
    setManualVoucher(true);
    setVoucherCode(value);
    // Sửa / xóa mã đang áp dụng thì bỏ luôn phần giảm của mã cũ
    if (appliedCode && value.trim().toUpperCase() !== appliedCode) setAppliedCode(''); // sửa mã -> bỏ mã cũ
    if (voucherMsg) setVoucherMsg('');
  };

  const applyVoucher = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) {
      setAppliedCode('');
      setVoucherMsg('');
      return;
    }
    try {
      const q = await quoteRequest(code); // backend kiểm tra mã + tính lại
      setQuote(q);
      setAppliedCode(code);
      setVoucherMsg(`Áp dụng mã thành công: giảm ${formatVND(q.voucherDiscount)}`);
    } catch (err) {
      setAppliedCode('');
      setVoucherMsg(err.response?.data?.message || 'Mã không hợp lệ');
    }
  };

  const handlePlaceOrder = async () => {
    setError('');
    if (cart.hasUnavailable) { // giỏ có món ngừng bán / thiếu hàng
      setError('Giỏ hàng có sản phẩm đã ngừng bán hoặc không đủ hàng - vui lòng quay lại giỏ hàng để điều chỉnh');
      return;
    }
    // SỬA LỖI: đơn hỏa tốc do chi nhánh của khung hỏa tốc xử lý (express.store, backend đã kiểm tra đủ hàng) -
    // trước đây vẫn bị chặn nếu chi nhánh đang chọn trong ô "Cửa hàng" thiếu hàng. Chỉ kiểm tra khi giao thường.
    if (!useExpress && !selectedStoreId) {
      setError('Vui lòng chọn cửa hàng xử lý đơn hàng');
      return;
    }
    if (!useExpress && selectedStore && !selectedStore.enough) {
      setError(`Cửa hàng ${selectedStore.name} không đủ hàng: ${selectedStore.missing.join(', ')}. Vui lòng chọn cửa hàng khác.`);
      return;
    }
    if (wantInvoice) {
      if (!invoice.companyName.trim() || !invoice.address.trim()) {
        setError('Vui lòng nhập đủ tên và địa chỉ công ty để xuất hóa đơn');
        return;
      }
      if (!TAX_CODE_RE.test(invoice.taxCode.replace(/\s/g, ''))) { // MST 10 / 10-3 / 12 số
        setError('Mã số thuế không hợp lệ (10 số, 10 số-3 số hoặc 12 số)');
        return;
      }
    }
    setSubmitting(true); // khóa nút đặt hàng (chống bấm 2 lần)
    try {
      const order = await orderService.createOrder({
        storeId: useExpress ? express.store._id : selectedStoreId, // hỏa tốc: chi nhánh của khung hỏa tốc
        deliveryAddress: address,
        express: useExpress ? { windowId: express.windowId, lat: express.lat, lng: express.lng } : undefined,
        deliveryMethod,
        paymentMode,
        voucherCode: appliedCode || undefined, // chỉ gửi mã đã áp thành công
        // Tổng tiền khách đang nhìn thấy - backend từ chối nếu số thật khác (khuyến mãi vừa đổi)
        expectedTotal: quote ? quote.grandTotal : undefined,
        invoiceInfo: wantInvoice ? invoice : undefined
      });
      await refreshCart(); // giỏ đã rỗng ở server -> cập nhật giao diện
      if (paymentMode === 'vnpay' || paymentMode === 'momo') { // thanh toán online -> chuyển sang cổng
        try {
          await paymentService.start(paymentMode, order._id); // chuyển sang cổng thanh toán
          return;
        } catch (err) {
          // Đơn đã tạo nhưng chưa mở được cổng thanh toán -> vào trang đơn hàng để thanh toán lại sau
          navigate(`/account/orders/${order._id}`, {
            state: { justPlaced: true, paymentError: err.response?.data?.message || `Không mở được cổng ${paymentMode === 'momo' ? 'MoMo' : 'VNPay'}` }
          });
          return;
        }
      }
      navigate(`/account/orders/${order._id}`, { state: { justPlaced: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Đặt hàng thất bại, vui lòng thử lại');
      // Tổng tiền vừa thay đổi -> tải lại bản xem trước để khách thấy số mới rồi bấm đặt lại
      if (err.response?.status === 409) quoteRequest(appliedCode).then(setQuote).catch(() => {}); // tổng tiền vừa đổi -> hiện số mới
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.items || cart.items.length === 0) {
    return <div className="text-center py-5">Giỏ hàng trống, không thể thanh toán.</div>;
  }

  return (
    <Container style={{ maxWidth: '56rem' }} className="py-4">
      <CheckoutSteps current={1} />
      <h1 className="fs-4 fw-bold mb-4">Thanh toán đơn hàng</h1>

      <Row className="g-4">
        <Col md={6}>
          <h2 className="fw-medium mb-3 fs-6">Chọn cửa hàng xử lý đơn hàng</h2>
          <Form.Select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="mb-4"
          >
            {stores.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} — {s.city} {s.enough ? '(đủ hàng)' : `(thiếu ${s.missing.length} sản phẩm)`}
              </option>
            ))}
          </Form.Select>
          {selectedStore && !selectedStore.enough && (
            <Alert variant="warning" className="small py-2 mt-n3 mb-4">
              Chi nhánh này không đủ hàng: {selectedStore.missing.join(', ')}.
              {stores.some((s) => s.enough) ? ' Vui lòng chọn chi nhánh có ghi "đủ hàng".' : ' Hiện không chi nhánh nào giao đủ cả giỏ, vui lòng giảm số lượng hoặc tách đơn.'}
            </Alert>
          )}

          <h2 className="fw-medium mb-3 fs-6">Địa chỉ nhận hàng</h2>
          <div className="d-flex flex-column gap-2">
            <Form.Control
              placeholder="Họ và tên"
              value={address.fullName}
              onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
            />
            <Form.Control
              placeholder="Số điện thoại"
              value={address.phone}
              onChange={(e) => setAddress({ ...address, phone: e.target.value })}
            />
            {savedAddresses.length > 0 && (
              <div className="d-flex flex-column gap-2 my-1" role="radiogroup" aria-label="Chọn địa chỉ nhận hàng">
                {savedAddresses.map((a) => (
                  <label
                    key={a._id}
                    className={`border rounded-3 p-2 px-3 d-flex gap-2 align-items-start small ${
                      addressChoice === a._id ? 'border-primary bg-primary-subtle' : ''
                    }`}
                    style={{ cursor: 'pointer' }}
                  >
                    <Form.Check.Input
                      type="radio"
                      name="checkoutAddress"
                      className="mt-1 flex-shrink-0"
                      checked={addressChoice === a._id}
                      onChange={() => chooseAddress(a._id)}
                    />
                    <span>
                      <span className="fw-medium">{a.label || 'Địa chỉ'}</span>
                      {a.isDefault && (
                        <Badge bg="primary" className="ms-2 fw-normal">
                          Mặc định
                        </Badge>
                      )}
                      <span className="d-block text-muted">
                        {[a.addressLine1, a.addressLine2, a.city].filter(Boolean).join(', ')}
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={`border rounded-3 p-2 px-3 d-flex gap-2 align-items-center small ${
                    addressChoice === 'new' ? 'border-primary bg-primary-subtle' : ''
                  }`}
                  style={{ cursor: 'pointer' }}
                >
                  <Form.Check.Input
                    type="radio"
                    name="checkoutAddress"
                    className="mt-0 flex-shrink-0"
                    checked={addressChoice === 'new'}
                    onChange={() => chooseAddress('new')}
                  />
                  <span className="fw-medium">Giao đến địa chỉ khác</span>
                </label>
                <Link to="/account/addresses" className="small">
                  Quản lý sổ địa chỉ
                </Link>
              </div>
            )}
            {addressChoice === 'new' && (
              <>
                <Form.Control
                  placeholder="Địa chỉ (số nhà, đường)"
                  value={address.addressLine1}
                  onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })}
                />
                <LocationFields
                  idPrefix="checkout"
                  city={address.city}
                  ward={address.addressLine2}
                  onChange={({ city, ward }) =>
                    setAddress((a) => ({ ...a, ...(city !== undefined && { city }), ...(ward !== undefined && { addressLine2: ward }) }))
                  }
                />
              </>
            )}
          </div>

          <h2 className="fw-medium mt-4 mb-3 fs-6">Hình thức nhận hàng</h2>
          <div className="d-flex flex-column gap-2 small">
            <Form.Check
              type="radio"
              id="delivery-home"
              name="deliveryMethod"
              label={
                qualifiesFreeShipping
                  ? 'Giao hàng tận nơi (Miễn phí)'
                  : `Giao hàng tận nơi (${formatVND(shippingFeeConfig)})`
              }
              checked={deliveryMethod === 'home_delivery'}
              onChange={() => setDeliveryMethod('home_delivery')}
            />
            <Form.Check
              type="radio"
              id="delivery-pickup"
              name="deliveryMethod"
              label="Nhận tại cửa hàng đã chọn (miễn phí)"
              checked={deliveryMethod === 'store_pickup'}
              onChange={() => setDeliveryMethod('store_pickup')}
            />
          </div>
          {deliveryMethod === 'home_delivery' && <div className="mt-2"><ExpressCheckout cartKey={cartKey} value={express} onChange={setExpress} /></div>}

          <h2 className="fw-medium mt-4 mb-3 fs-6">Phương thức thanh toán</h2>
          <div className="d-flex flex-column gap-2 small">
            <Form.Check
              type="radio"
              id="payment-cod"
              name="paymentMode"
              label="Thanh toán khi nhận hàng (COD)"
              checked={paymentMode === 'cod'}
              onChange={() => setPaymentMode('cod')}
            />
            {methods.vnpay && (
              <Form.Check
                type="radio"
                id="payment-vnpay"
                name="paymentMode"
                label="Thanh toán online qua VNPay (thẻ ATM, Visa/Master, QR)"
                checked={paymentMode === 'vnpay'}
                onChange={() => setPaymentMode('vnpay')}
              />
            )}
            {methods.momo && (
              <>
                <Form.Check
                  type="radio"
                  id="payment-momo"
                  name="paymentMode"
                  label="Thanh toán qua ví MoMo (ví MoMo, thẻ ATM, Visa/Master)"
                  checked={paymentMode === 'momo'}
                  disabled={!momoAllowed}
                  onChange={() => setPaymentMode('momo')}
                />
                {!momoAllowed && (
                  <div className="text-muted ms-4" style={{ fontSize: 12 }}>
                    MoMo chỉ nhận đơn từ {methods.momoLimits.min.toLocaleString('vi-VN')}đ đến{' '}
                    {methods.momoLimits.max.toLocaleString('vi-VN')}đ
                  </div>
                )}
              </>
            )}
          </div>

          {/* Xuất hóa đơn điện tử cho doanh nghiệp (thông tin lưu kèm đơn, quản trị xuất file gửi lên hệ thống HĐĐT) */}
          <div className="mt-4">
            <Form.Check
              type="switch"
              id="want-invoice"
              label={<span className="fw-medium">Xuất hóa đơn công ty (hóa đơn GTGT)</span>}
              checked={wantInvoice}
              onChange={(e) => setWantInvoice(e.target.checked)}
            />
            {wantInvoice && (
              <div className="border rounded-3 p-3 mt-2 d-flex flex-column gap-2">
                <Form.Control
                  placeholder="Tên công ty *"
                  value={invoice.companyName}
                  maxLength={200}
                  onChange={(e) => setInvoice({ ...invoice, companyName: e.target.value })}
                />
                <Form.Control
                  placeholder="Mã số thuế * (VD: 0101234567)"
                  value={invoice.taxCode}
                  inputMode="numeric"
                  maxLength={14}
                  isInvalid={invoice.taxCode !== '' && !TAX_CODE_RE.test(invoice.taxCode.replace(/\s/g, ''))}
                  onChange={(e) => setInvoice({ ...invoice, taxCode: e.target.value })}
                />
                <Form.Control.Feedback type="invalid">Mã số thuế gồm 10 số, 10 số-3 số hoặc 12 số</Form.Control.Feedback>
                <Form.Control
                  placeholder="Địa chỉ công ty (theo đăng ký thuế) *"
                  value={invoice.address}
                  maxLength={300}
                  onChange={(e) => setInvoice({ ...invoice, address: e.target.value })}
                />
                <Form.Control
                  type="email"
                  placeholder="Email nhận hóa đơn (không bắt buộc)"
                  value={invoice.email}
                  maxLength={120}
                  onChange={(e) => setInvoice({ ...invoice, email: e.target.value })}
                />
                <div className="small text-muted">Hóa đơn điện tử được gửi qua email sau khi đơn hàng hoàn tất.</div>
              </div>
            )}
          </div>
        </Col>

        <Col md={6}>
          <h2 className="fw-medium mb-3 fs-6">Đơn hàng của bạn</h2>
          <Card className="mb-4">
            {cart.items.map((item, idx) => (
              <div
                key={item._id}
                className={`d-flex justify-content-between p-3 small ${idx > 0 ? 'border-top' : ''}`}
              >
                <span>
                  {item.name}
                  {item.variantLabel && <span className="text-muted"> ({item.variantLabel})</span>} x{item.quantity}
                </span>
                <span>{formatVND(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </Card>

          <div className="d-flex gap-2 mb-4">
            <Form.Control
              placeholder="Nhập mã giảm giá"
              value={voucherCode}
              onChange={(e) => handleVoucherCodeChange(e.target.value)}
              size="sm"
            />
            <Button variant="dark" size="sm" onClick={applyVoucher} className="text-nowrap">
              Áp dụng
            </Button>
          </div>
          {voucherMsg && <div className="small text-muted mb-3">{voucherMsg}</div>}
          <VoucherSuggestions offers={offers} applied={appliedCode} onPick={pickOffer} />

          <Card>
            <Card.Body className="d-flex flex-column gap-2 small">
              <div className="d-flex justify-content-between">
                <span>Tạm tính</span>
                <span>{formatVND(totalAmount)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Phí vận chuyển</span>
                <span>{formatVND(shippingFee)}</span>
              </div>
              {(quote?.promotions || []).map((p) => (
                <div key={p.promotionId} className="d-flex justify-content-between text-success">
                  <span>Khuyến mãi: {p.name}</span>
                  <span>-{formatVND(p.amount)}</span>
                </div>
              ))}
              {voucherDiscount > 0 && (
                <div className="d-flex justify-content-between text-success">
                  <span>Mã giảm giá {appliedCode}</span>
                  <span>-{formatVND(voucherDiscount)}</span>
                </div>
              )}
              {quote?.tier && promotionDiscount > 0 && (
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Hạng thành viên của bạn: {quote.tier.name}</div>
              )}
              <div className="d-flex justify-content-between fw-bold fs-6 border-top pt-2">
                <span>Tổng cộng</span>
                <span className="text-primary">{formatVND(grandTotal)}</span>
              </div>
              <VatBreakdown vat={quote?.vat || orderVat(cart?.items || [], shippingFee, discount, settings.shippingVatRate ?? 10).vat} shippingVat={quote?.shippingVat || orderVat(cart?.items || [], shippingFee, discount, settings.shippingVatRate ?? 10).shippingVat} shippingFee={shippingFee} />
            </Card.Body>
          </Card>

          {error && (
            <Alert variant="danger" className="small mt-3 py-2 mb-0">
              {error}
            </Alert>
          )}

          <Button
            variant="primary"
            className="w-100 fw-medium py-2 mt-3"
            disabled={submitting}
            onClick={handlePlaceOrder}
          >
            {submitting ? 'Đang xử lý...' : 'Đặt hàng'}
          </Button>
        </Col>
      </Row>
    </Container>
  );
}
