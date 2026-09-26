import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Container, Card, Spinner, Button } from 'react-bootstrap';
import { paymentService } from '../services/paymentService';

// Mô tả một số mã lỗi VNPay thường gặp (vnp_ResponseCode)
const VNPAY_MESSAGES = {
  '07': 'Giao dịch bị nghi ngờ gian lận',
  '09': 'Thẻ/Tài khoản chưa đăng ký Internet Banking',
  10: 'Xác thực thông tin thẻ không đúng quá 3 lần',
  11: 'Đã hết thời gian chờ thanh toán',
  12: 'Thẻ/Tài khoản bị khóa',
  13: 'Sai mật khẩu xác thực giao dịch (OTP)',
  24: 'Bạn đã hủy giao dịch',
  51: 'Tài khoản không đủ số dư',
  65: 'Tài khoản đã vượt hạn mức giao dịch trong ngày',
  75: 'Ngân hàng thanh toán đang bảo trì'
};

// Trang VNPay chuyển về sau khi khách thanh toán (VNP_RETURN_URL). Kết quả chỉ được tin sau khi
// backend kiểm tra chữ ký - không dựa vào tham số trên URL.
export default function PaymentReturnPage() {
  const { search } = useLocation();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService
      .verifyVnpayReturn(search)
      .then(setResult)
      .catch((err) => setError(err.response?.data?.message || 'Không xác minh được kết quả thanh toán'));
  }, [search]);

  if (!result && !error) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
        <div className="small text-muted mt-2">Đang xác minh kết quả thanh toán...</div>
      </div>
    );
  }

  const success = result?.success;
  return (
    <Container className="py-5" style={{ maxWidth: '32rem' }}>
      <Card className="text-center shadow-sm border-0">
        <Card.Body className="p-4">
          <div className="display-5 mb-2">{success ? '✅' : '❌'}</div>
          <h1 className="fs-4 fw-bold">{success ? 'Thanh toán thành công' : 'Thanh toán chưa thành công'}</h1>
          {result && (
            <p className="small text-muted mb-4">
              Đơn hàng <strong>{result.orderCode}</strong> — {result.amount?.toLocaleString('vi-VN')}đ
              {!success && (
                <>
                  <br />
                  {VNPAY_MESSAGES[result.responseCode] || 'Giao dịch không thành công'}. Bạn có thể thanh toán lại trong trang đơn hàng.
                </>
              )}
            </p>
          )}
          {error && <p className="small text-danger mb-4">{error}</p>}
          <div className="d-flex gap-2 justify-content-center">
            {result?.orderId && (
              <Button as={Link} to={`/account/orders/${result.orderId}`} variant="primary">
                Xem đơn hàng
              </Button>
            )}
            <Button as={Link} to="/" variant="outline-secondary">
              Về trang chủ
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
}
