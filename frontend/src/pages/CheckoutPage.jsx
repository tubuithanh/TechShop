import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Form, Button, Card, Alert } from 'react-bootstrap';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';
import { orderService } from '../services/orderService';
import { storeService } from '../services/storeService';
import api from '../services/api';

function formatVND(value) {
  return value?.toLocaleString('vi-VN') + 'đ';
}

export default function CheckoutPage() {
  const { cart, totalAmount, refreshCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const defaultAddress = user?.addresses?.[0];
  const [address, setAddress] = useState({
    fullName: user?.displayName || '',
    phone: user?.phoneNumber || '',
    addressLine1: defaultAddress?.addressLine1 || '',
    addressLine2: defaultAddress?.addressLine2 || '',
    city: defaultAddress?.city || '',
    state: defaultAddress?.state || '',
    pincode: defaultAddress?.pincode || ''
  });
  const [deliveryMethod, setDeliveryMethod] = useState('home_delivery');
  const [paymentMode, setPaymentMode] = useState('cod');
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

  const shippingFee = deliveryMethod === 'store_pickup' ? 0 : 30000;
  const grandTotal = Math.max(totalAmount + shippingFee - discount, 0);

  const applyVoucher = async () => {
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
            <Form.Control
              placeholder="Địa chỉ (số nhà, đường)"
              value={address.addressLine1}
              onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })}
            />
            <Form.Control
              placeholder="Phường/Xã, Quận/Huyện"
              value={address.addressLine2}
              onChange={(e) => setAddress({ ...address, addressLine2: e.target.value })}
            />
            <Form.Control
              placeholder="Tỉnh/Thành phố"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
            />
          </div>

          <h2 className="fw-medium mt-4 mb-3 fs-6">Hình thức nhận hàng</h2>
          <div className="d-flex flex-column gap-2 small">
            <Form.Check
              type="radio"
              id="delivery-home"
              name="deliveryMethod"
              label="Giao hàng tận nơi (30.000đ)"
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
            <Form.Check
              type="radio"
              id="payment-vnpay"
              name="paymentMode"
              label="Thanh toán qua VNPay (demo/sandbox)"
              checked={paymentMode === 'vnpay'}
              onChange={() => setPaymentMode('vnpay')}
            />
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
                  {item.name} x{item.quantity}
                </span>
                <span>{formatVND(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </Card>

          <div className="d-flex gap-2 mb-4">
            <Form.Control
              placeholder="Nhập mã giảm giá"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
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
