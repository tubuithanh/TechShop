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
  return { txnRef, createDate: params.vnp_CreateDate, paymentUrl: `${url}?${query}&vnp_SecureHash=${hash}` };
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
    bankCode: rest.vnp_BankCode,
    payDate: rest.vnp_PayDate
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
    const code = err.cause?.code || err.name;
    // Máy chủ đặt ở nước ngoài (VD: Render) thường bị VNPay sandbox không phản hồi -> quá thời gian chờ.
    // Trường hợp này KHÔNG có nghĩa cấu hình sai: khách mở trang VNPay bằng trình duyệt của mình nên vẫn thanh toán được.
    if (/TIMEOUT|TimeoutError|AbortError/i.test(code)) {
      return {
        ok: false,
        message: `Máy chủ không kết nối được tới VNPay (${code}). VNPay sandbox thường không phản hồi máy chủ đặt ở nước ngoài ` +
          '(VD: Render) - điều này không có nghĩa cấu hình sai, khách vẫn mở được trang thanh toán bằng trình duyệt. ' +
          'Để kiểm tra Terminal ID / Secret Key, hãy chạy backend trên máy tại Việt Nam rồi bấm "Kiểm tra kết nối".'
      };
    }
    return { ok: false, message: `Không kết nối được tới VNPay (${code}): ${cfg.url}` };
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


// ---------- HOÀN TIỀN (API merchant_webapi, lệnh "refund") ----------
// Địa chỉ API truy vấn / hoàn tiền nằm cùng tên miền với cổng thanh toán:
//   sandbox:  https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
//   thật:     https://<tên miền VNPay cấp>/merchant_webapi/api/transaction
function apiUrlFrom(payUrl) {
  try { return `${new URL(payUrl).origin}/merchant_webapi/api/transaction`; } catch { return 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'; }
}

const REFUND_ERRORS = {
  '02': 'Mã merchant (TmnCode) không hợp lệ',
  '03': 'Dữ liệu gửi sang không đúng định dạng',
  '91': 'Không tìm thấy giao dịch gốc cần hoàn',
  '94': 'Yêu cầu bị trùng (đã gửi hoàn tiền cho giao dịch này)',
  '95': 'Giao dịch gốc không thành công, không thể hoàn tiền',
  '97': 'Chữ ký không hợp lệ (kiểm tra Secret Key)',
  '99': 'Lỗi khác từ VNPay'
};

class VnpayRefundError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Hoàn tiền 1 giao dịch đã thanh toán. amount = số tiền hoàn (đồng); full = hoàn toàn bộ (02) hay một phần (03).
// Trả về { requestId, code, message, transactionNo } nếu VNPay chấp nhận (vnp_ResponseCode = 00), ném lỗi nếu không.
async function refund({ txnRef, transactionNo, transactionDate, amount, full = true, createBy, ipAddr, orderInfo, cfg, now = new Date() }) {
  const c = cfg || (await getConfig());
  if (!isComplete(c)) throw new VnpayRefundError('VNPay chưa được cấu hình');
  if (!txnRef || !transactionDate) throw new VnpayRefundError('Đơn thiếu thông tin giao dịch gốc (mã giao dịch / thời gian tạo) - không hoàn tự động được');
  const p = {
    vnp_RequestId: `RF${now.getTime()}${crypto.randomBytes(2).toString('hex')}`.slice(0, 32),
    vnp_Version: '2.1.0',
    vnp_Command: 'refund',
    vnp_TmnCode: c.tmnCode,
    vnp_TransactionType: full ? '02' : '03',
    vnp_TxnRef: txnRef,
    vnp_Amount: Math.round(amount) * 100,
    vnp_TransactionNo: transactionNo || '0',
    vnp_TransactionDate: transactionDate,
    vnp_CreateBy: String(createBy || 'admin').slice(0, 250),
    vnp_CreateDate: vnTime(now),
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_OrderInfo: orderInfo || `Hoan tien giao dich ${txnRef}`
  };
  // Chữ ký API: các trường nối bằng "|" theo đúng thứ tự tài liệu VNPay, HMAC-SHA512
  const signData = [p.vnp_RequestId, p.vnp_Version, p.vnp_Command, p.vnp_TmnCode, p.vnp_TransactionType, p.vnp_TxnRef,
    p.vnp_Amount, p.vnp_TransactionNo, p.vnp_TransactionDate, p.vnp_CreateBy, p.vnp_CreateDate, p.vnp_IpAddr, p.vnp_OrderInfo].join('|');
  p.vnp_SecureHash = crypto.createHmac('sha512', c.hashSecret).update(Buffer.from(signData, 'utf-8')).digest('hex');

  let res;
  try {
    res = await fetch(apiUrlFrom(c.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(20000)
    });
  } catch (err) {
    throw new VnpayRefundError(`Không kết nối được tới VNPay (${err.cause?.code || err.name}) - chưa biết kết quả, hãy kiểm tra trên trang merchant trước khi thử lại`, 'NETWORK');
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new VnpayRefundError(`VNPay phản hồi không hợp lệ (HTTP ${res.status})`, 'BAD_RESPONSE');
  // Kiểm tra chữ ký phản hồi để chắc chắn dữ liệu đến từ VNPay
  if (data.vnp_SecureHash) {
    const respData = [data.vnp_ResponseId, data.vnp_Command, data.vnp_ResponseCode, data.vnp_Message, data.vnp_TmnCode, data.vnp_TxnRef,
      data.vnp_Amount, data.vnp_BankCode, data.vnp_PayDate, data.vnp_TransactionNo, data.vnp_TransactionType, data.vnp_TransactionStatus,
      data.vnp_OrderInfo].map((v) => v ?? '').join('|');
    const expected = crypto.createHmac('sha512', c.hashSecret).update(Buffer.from(respData, 'utf-8')).digest('hex');
    if (expected.toLowerCase() !== String(data.vnp_SecureHash).toLowerCase()) {
      throw new VnpayRefundError('Chữ ký phản hồi từ VNPay không hợp lệ', 'BAD_SIGNATURE');
    }
  }
  const code = String(data.vnp_ResponseCode ?? '');
  if (code !== '00') throw new VnpayRefundError(REFUND_ERRORS[code] || data.vnp_Message || `VNPay từ chối hoàn tiền (mã ${code})`, code);
  return { requestId: p.vnp_RequestId, code, message: data.vnp_Message || 'Thành công', transactionNo: data.vnp_TransactionNo };
}

module.exports = {
  refund,
  VnpayRefundError,
  apiUrlFrom,
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
