const crypto = require('crypto');
const PaymentConfig = require('../models/PaymentConfig');
const { decrypt } = require('./secretBox');

// Tích hợp cổng thanh toán VNPay (phiên bản 2.1.0). Đăng ký tài khoản sandbox miễn phí tại
// https://sandbox.vnpayment.vn/devreg để lấy Terminal ID (TmnCode) và Secret Key (HashSecret).
// Cấu hình ở Admin -> Cấu hình hệ thống -> Cấu hình thanh toán VNPay, hoặc qua biến môi trường VNP_*.
const DEFAULT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const defaultReturnUrl = () => `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/vnpay-return`;

function configFromEnv() {
  return {
    source: 'env',
    tmnCode: process.env.VNP_TMN_CODE || '',
    hashSecret: process.env.VNP_HASH_SECRET || '',
    url: process.env.VNP_URL || DEFAULT_URL,
    returnUrl: process.env.VNP_RETURN_URL || defaultReturnUrl()
  };
}

// Bản ghi cấu hình -> cấu hình dùng được (giải mã Secret Key)
function configFromDoc(doc) {
  if (!doc || doc.vnpayMode === 'env') return configFromEnv();
  if (doc.vnpayMode === 'off') return { source: 'off', tmnCode: '', hashSecret: '', url: DEFAULT_URL, returnUrl: defaultReturnUrl() };
  return {
    source: 'custom',
    tmnCode: doc.vnpTmnCode || '',
    hashSecret: decrypt(doc.vnpHashSecretEnc) || '',
    url: doc.vnpUrl || DEFAULT_URL,
    returnUrl: doc.vnpReturnUrl || defaultReturnUrl()
  };
}

// Đọc bản ghi cấu hình có bộ nhớ đệm 30 giây (không truy vấn DB ở mỗi lần thanh toán).
// Chỉ đệm bản ghi DB; biến môi trường luôn đọc mới.
const CACHE_MS = 30 * 1000;
let cache = null;
async function getConfig() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { doc: await PaymentConfig.findOne().lean(), at: Date.now() };
  }
  return configFromDoc(cache.doc);
}
function clearPaymentConfigCache() {
  cache = null;
}

const isComplete = (cfg) => Boolean(cfg.tmnCode && cfg.hashSecret);
const isConfigured = async () => isComplete(await getConfig());

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
// `cfg` truyền vào khi kiểm tra cấu hình chưa lưu; bỏ trống thì dùng cấu hình hiện hành.
async function buildPaymentUrl({ order, ipAddr, now = new Date(), cfg }) {
  const { tmnCode, hashSecret, url, returnUrl } = cfg || (await getConfig());
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
async function verifyReturn(queryParams) {
  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = queryParams;
  const cfg = await getConfig();
  if (!vnp_SecureHash || !isComplete(cfg)) return null;
  const { hash } = signedQuery(rest, cfg.hashSecret);
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

// Mã lỗi VNPay trả về khi mở link thanh toán (trang Error.html?code=...)
const VNPAY_ERRORS = {
  70: 'Sai chữ ký - Secret Key (vnp_HashSecret) không đúng',
  71: 'Website chưa được phép thanh toán',
  72: 'Không tìm thấy Terminal ID (vnp_TmnCode) - kiểm tra lại mã',
  76: 'Ngân hàng không hỗ trợ',
  15: 'Giao dịch đã hết hạn',
  3: 'Dữ liệu gửi sang không đúng định dạng',
  1: 'Giao dịch đã tồn tại',
  2: 'Merchant không hợp lệ (kiểm tra lại vnp_TmnCode)'
};

// Kiểm tra kết nối: tạo 1 link thanh toán thử (10.000đ, không tạo giao dịch thật) rồi mở thử link.
// VNPay chuyển sang trang chọn phương thức thanh toán nếu mã đúng, hoặc trang Error.html?code=... nếu sai.
async function testConnection(cfg) {
  if (!isComplete(cfg)) return { ok: false, message: 'Chưa nhập đủ Terminal ID và Secret Key' };
  const { paymentUrl } = await buildPaymentUrl({ order: { orderCode: 'TEST', grandTotal: 10000 }, cfg });
  let res;
  try {
    res = await fetch(paymentUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch (err) {
    return { ok: false, message: `Không kết nối được tới VNPay (${err.cause?.code || err.name}): ${cfg.url}` };
  }
  const location = res.headers.get('location') || '';
  const code = location.match(/Error\.html\?code=(\d+)/i)?.[1];
  if (code) return { ok: false, message: VNPAY_ERRORS[Number(code)] || `VNPay báo lỗi mã ${code}` };
  if (res.status >= 300 && res.status < 400 && location) {
    return { ok: true, message: 'Kết nối VNPay thành công - Terminal ID và Secret Key hợp lệ' };
  }
  if (res.status === 200) return { ok: true, message: 'VNPay đã nhận yêu cầu thanh toán thử' };
  return { ok: false, message: `VNPay phản hồi không như mong đợi (HTTP ${res.status})` };
}

module.exports = {
  isConfigured,
  getConfig,
  configFromEnv,
  configFromDoc,
  clearPaymentConfigCache,
  buildPaymentUrl,
  verifyReturn,
  signedQuery,
  testConnection,
  DEFAULT_URL,
  defaultReturnUrl
};
