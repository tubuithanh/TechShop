import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Card, Alert, Badge } from 'react-bootstrap';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { useSettings } from '../store/SettingsContext';
import { orderService } from '../services/orderService';
import { storeService } from '../services/storeService';
import { paymentService } from '../services/paymentService';
import api from '../services/api';
import LocationFields from '../components/LocationFields';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CheckoutPage() {
  const { cart, totalAmount, refreshCart } = useCart();
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const savedAddresses = user?.addresses || [];
  const defaultAddress = savedAddresses.find((a) => a.isDefault) || savedAddresses[0];
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
    const a = savedAddresses.find((x) => x._id === choice);
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
    if (defaultAddress && addressChoice === 'new' && !address.addressLine1) chooseAddress(defaultAddress._id);
    if (user && !address.fullName && !address.phone) {
      setAddress((cur) => ({ ...cur, fullName: user.displayName || '', phone: user.phoneNumber || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const [deliveryMethod, setDeliveryMethod] = useState('home_delivery');
  const [paymentMode, setPaymentMode] = useState('cod');
  // Cổng thanh toán online đã cấu hình trên máy chủ (cổng chưa cấu hình thì ẩn lựa chọn)
  const [methods, setMethods] = useState({ vnpay: false, momo: false, momoLimits: { min: 1000, max: 50000000 } });
  useEffect(() => {
    paymentService
      .getMethods()
      .then(setMethods)
      .catch(() => setMethods((m) => ({ ...m, vnpay: false, momo: false })));
  }, []);
  const [voucherCode, setVoucherCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [voucherMsg, setVoucherMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    storeService.getStores().then((data) => {
      setStores(data);
      if (data.length > 0) setSelectedStoreId(data[0]._id);
    });
  }, []);

  // Tính phí ship GIỐNG HỆT logic backend (orderController.js/createOrder) - trước đây trang này
  // hardcode 30.000đ, bỏ qua hoàn toàn ngưỡng miễn phí ship (freeShippingThreshold) admin đã cấu
  // hình, khiến khách nhìn thấy tổng tiền xem trước SAI (cao hơn số tiền thực sự bị tính khi đặt).
  const shippingFeeConfig = settings.defaultShippingFee ?? 30000;
  const freeShippingThreshold = settings.freeShippingThreshold ?? 0;
  const qualifiesFreeShipping = freeShippingThreshold > 0 && totalAmount >= freeShippingThreshold;
  const shippingFee = deliveryMethod === 'store_pickup' || qualifiesFreeShipping ? 0 : shippingFeeConfig;
  const grandTotal = Math.max(totalAmount + shippingFee - discount, 0);
  // MoMo giới hạn số tiền mỗi giao dịch (1.000đ - 50.000.000đ)
  const momoAllowed = grandTotal >= methods.momoLimits.min && grandTotal <= methods.momoLimits.max;
  // Cổng đang chọn không còn dùng được (chưa cấu hình / vượt giới hạn) -> quay về COD
  useEffect(() => {
    if ((paymentMode === 'vnpay' && !methods.vnpay) || (paymentMode === 'momo' && (!methods.momo || !momoAllowed))) {
      setPaymentMode('cod');
    }
  }, [paymentMode, methods, momoAllowed]);

  const handleVoucherCodeChange = (value) => {
    setVoucherCode(value);
    // Xoá mã / sửa lại mã đang có hiệu lực trước đó thì phải bỏ luôn số tiền giảm giá đã áp dụng -
    // trước đây discount/voucherMsg chỉ được set khi "Áp dụng" thành công, không bao giờ được reset,
    // nên khách xoá/đổi mã vẫn thấy số tiền giảm giá CŨ áp dụng trên tổng tiền dù mã đã đổi/mất.
    if (discount > 0) setDiscount(0);
    if (voucherMsg) setVoucherMsg('');
  };

  const applyVoucher = async () => {
    if (!voucherCode.trim()) {
      setDiscount(0);
      setVoucherMsg('');
      return;
    }
    try {
      const { data } = await api.post('/vouchers/validate', { code: voucherCode, orderValue: totalAmount });
      setDiscount(data.data.discountAmount);
      setVoucherMsg('Áp dụng mã giảm giá thành công!');
    } catch (err) {
      setDiscount(0);
      setVoucherMsg(err.response?.data?.message || 'Mã không hợp lệ');
    }
  };

  const handlePlaceOrder = async () => {
    setError('');
    if (cart.hasUnavailable) {
      setError('Giỏ hàng có sản phẩm đã ngừng bán hoặc không đủ hàng - vui lòng quay lại giỏ hàng để điều chỉnh');
      return;
    }
    if (!selectedStoreId) {
      setError('Vui lòng chọn cửa hàng xử lý đơn hàng');
      return;
    }
    setSubmitting(true);
    try {
      const order = await orderService.createOrder({
        storeId: selectedStoreId,
        deliveryAddress: address,
        deliveryMethod,
        paymentMode,
        voucherCode: discount > 0 ? voucherCode : undefined
      });
      await refreshCart();
      if (paymentMode === 'vnpay' || paymentMode === 'momo') {
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
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.items || cart.items.length === 0) {
    return <div className="text-center py-5">Giỏ hàng trống, không thể thanh toán.</div>;
  }

  return (
    <Container style={{ maxWidth: '56rem' }} className="py-4">
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
                {s.name} — {s.city}
              </option>
            ))}
          </Form.Select>

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
              {discount > 0 && (
                <div className="d-flex justify-content-between text-success">
                  <span>Giảm giá</span>
                  <span>-{formatVND(discount)}</span>
                </div>
              )}
              <div className="d-flex justify-content-between fw-bold fs-6 border-top pt-2">
                <span>Tổng cộng</span>
                <span className="text-primary">{formatVND(grandTotal)}</span>
              </div>
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
