const crypto = require('crypto');

// Tích hợp cổng thanh toán VNPay (phiên bản 2.1.0). Cấu hình qua biến môi trường - đăng ký tài khoản
// sandbox miễn phí tại https://sandbox.vnpayment.vn/devreg để lấy VNP_TMN_CODE và VNP_HASH_SECRET.
const config = () => ({
  tmnCode: process.env.VNP_TMN_CODE,
  hashSecret: process.env.VNP_HASH_SECRET,
  url: process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: process.env.VNP_RETURN_URL || `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/vnpay-return`
});

const isConfigured = () => Boolean(config().tmnCode && config().hashSecret);

// VNPay ký trên chuỗi query đã sắp xếp theo tên tham số, mã hóa kiểu application/x-www-form-urlencoded
// (khoảng trắng thành "+") - phải dựng đúng y hệt thì chữ ký mới khớp phía VNPay.
function encode(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, '+');
}
function signedQuery(params, secret) {
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join('&');
  const hash = crypto.createHmac('sha512', secret).update(Buffer.from(query, 'utf-8')).digest('hex');
  return { query, hash };
}

// Thời gian theo múi giờ Việt Nam, định dạng yyyyMMddHHmmss như VNPay yêu cầu
function vnTime(date) {
  const d = new Date(date.getTime() + 7 * 3600 * 1000);
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

// Mỗi lần thanh toán cần 1 mã giao dịch (TxnRef) MỚI - VNPay từ chối mã đã dùng, nên thử thanh toán lại
// sau khi thất bại phải sinh mã khác. Mã giao dịch = mã đơn + dấu thời gian.
function buildPaymentUrl({ order, ipAddr, now = new Date() }) {
  const { tmnCode, hashSecret, url, returnUrl } = config();
  const txnRef = `${order.orderCode}${now.getTime().toString().slice(-6)}`;
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`,
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(order.grandTotal) * 100, // VNPay tính theo đơn vị 1/100 đồng
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: vnTime(now),
    vnp_ExpireDate: vnTime(new Date(now.getTime() + 15 * 60 * 1000))
  };
  const { query, hash } = signedQuery(params, hashSecret);
  return { txnRef, paymentUrl: `${url}?${query}&vnp_SecureHash=${hash}` };
}

// Kiểm tra chữ ký của dữ liệu VNPay gửi về (trang return và IPN). Trả về null nếu chữ ký sai.
function verifyReturn(queryParams) {
  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = queryParams;
  if (!vnp_SecureHash || !isConfigured()) return null;
  const { hash } = signedQuery(rest, config().hashSecret);
  const a = Buffer.from(hash.toLowerCase());
  const b = Buffer.from(String(vnp_SecureHash).toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return {
    txnRef: rest.vnp_TxnRef,
    amount: Number(rest.vnp_Amount) / 100,
    success: rest.vnp_ResponseCode === '00' && rest.vnp_TransactionStatus === '00',
    responseCode: rest.vnp_ResponseCode,
    transactionNo: rest.vnp_TransactionNo,
    bankCode: rest.vnp_BankCode
  };
}

module.exports = { isConfigured, buildPaymentUrl, verifyReturn, signedQuery };
