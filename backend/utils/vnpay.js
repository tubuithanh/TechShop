const crypto = require('crypto'); // thư viện mã hóa có sẵn của Node (HMAC, so sánh an toàn)
const PaymentConfig = require('../models/PaymentConfig'); // cấu hình cổng thanh toán lưu trong DB
const { decrypt } = require('./secretBox'); // giải mã Secret Key (lưu dạng mã hóa trong DB)

// Tích hợp cổng thanh toán VNPay (phiên bản 2.1.0). Đăng ký tài khoản sandbox miễn phí tại
// https://sandbox.vnpayment.vn/devreg để lấy Terminal ID (TmnCode) và Secret Key (HashSecret).
// Cấu hình ở Admin -> Cấu hình hệ thống -> Cấu hình thanh toán VNPay, hoặc qua biến môi trường VNP_*.
const DEFAULT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'; // cổng VNPay thử nghiệm (sandbox)
const defaultReturnUrl = () => `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/vnpay-return`; // trang frontend nhận kết quả thanh toán

function configFromEnv() {
  return {
    source: 'env', // nguồn cấu hình: biến môi trường
    tmnCode: process.env.VNP_TMN_CODE || '', // mã website (Terminal ID) do VNPay cấp
    hashSecret: process.env.VNP_HASH_SECRET || '', // khóa bí mật để ký / kiểm chữ ký
    url: process.env.VNP_URL || DEFAULT_URL,
    returnUrl: process.env.VNP_RETURN_URL || defaultReturnUrl()
  };
}

// Bản ghi cấu hình -> cấu hình dùng được (giải mã Secret Key)
function configFromDoc(doc) {
  if (!doc || doc.vnpayMode === 'env') return configFromEnv(); // chưa có cấu hình DB hoặc chọn 'dùng biến môi trường'
  if (doc.vnpayMode === 'off') return { source: 'off', tmnCode: '', hashSecret: '', url: DEFAULT_URL, returnUrl: defaultReturnUrl() }; // admin tắt VNPay -> cấu hình rỗng (isConfigured = false)
  if (doc.vnpayMode === 'simulator') return require('./paymentSimulator').vnpayConfig(doc.vnpReturnUrl || defaultReturnUrl()); // chế độ giả lập: dùng khóa nội bộ của trang thanh toán giả
  return {
    source: 'custom', // cấu hình admin nhập trong trang quản trị
    tmnCode: doc.vnpTmnCode || '',
    hashSecret: decrypt(doc.vnpHashSecretEnc) || '', // giải mã khóa bí mật
    url: doc.vnpUrl || DEFAULT_URL,
    returnUrl: doc.vnpReturnUrl || defaultReturnUrl()
  };
}

// Đọc bản ghi cấu hình có bộ nhớ đệm 30 giây (không truy vấn DB ở mỗi lần thanh toán).
// Chỉ đệm bản ghi DB; biến môi trường luôn đọc mới.
const CACHE_MS = 30 * 1000; // đệm 30 giây
let cache = null;
async function getConfig() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { doc: await PaymentConfig.findOne().lean(), at: Date.now() }; // đọc lại DB khi đệm hết hạn
  }
  return configFromDoc(cache.doc);
}
function clearPaymentConfigCache() {
  cache = null; // admin lưu cấu hình mới -> xóa đệm để có hiệu lực ngay
}

const isComplete = (cfg) => Boolean(cfg.tmnCode && cfg.hashSecret); // đủ mã website + khóa bí mật mới dùng được
const isConfigured = async () => isComplete(await getConfig()); // trang thanh toán dùng để ẩn / hiện nút VNPay

// VNPay ký trên chuỗi query đã sắp xếp theo tên tham số, mã hóa kiểu application/x-www-form-urlencoded
// (khoảng trắng thành "+") - phải dựng đúng y hệt thì chữ ký mới khớp phía VNPay.
function encode(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, '+'); // mã hóa URL, khoảng trắng -> "+" (đúng kiểu VNPay)
}
function signedQuery(params, secret) {
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '') // bỏ tham số rỗng (VNPay không ký tham số rỗng)
    .sort() // sắp xếp tên tham số theo bảng chữ cái
    .map((k) => `${encode(k)}=${encode(params[k])}`) // ghép thành "ten=giatri"
    .join('&'); // nối bằng "&" -> chuỗi cần ký
  const hash = crypto.createHmac('sha512', secret).update(Buffer.from(query, 'utf-8')).digest('hex'); // chữ ký = HMAC-SHA512(chuỗi, khóa bí mật)
  return { query, hash };
}

// Thời gian theo múi giờ Việt Nam, định dạng yyyyMMddHHmmss như VNPay yêu cầu
function vnTime(date) {
  const d = new Date(date.getTime() + 7 * 3600 * 1000); // cộng 7 giờ -> giờ Việt Nam
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14); // "2026-11-14T08:30:00" -> "20261114083000"
}

// Mỗi lần thanh toán cần 1 mã giao dịch (TxnRef) MỚI - VNPay từ chối mã đã dùng, nên thử thanh toán lại
// sau khi thất bại phải sinh mã khác. Mã giao dịch = mã đơn + dấu thời gian.
// `cfg` truyền vào khi kiểm tra cấu hình chưa lưu; bỏ trống thì dùng cấu hình hiện hành.
// apiBase: địa chỉ backend (VD https://techshop-twv1.onrender.com) - chỉ dùng ở chế độ giả lập để trỏ tới trang thanh toán giả
async function buildPaymentUrl({ order, ipAddr, now = new Date(), cfg, apiBase = '' }) {
  const c0 = cfg || (await getConfig()); // cấu hình đang dùng
  const { tmnCode, hashSecret, returnUrl } = c0; // tách các giá trị cần dùng
  const url = c0.source === 'simulator' ? `${apiBase}/api/payments/simulator/vnpay` : c0.url; // giả lập -> trang thanh toán giả của backend
  const txnRef = `${order.orderCode}${now.getTime().toString().slice(-6)}`; // mã giao dịch = mã đơn + 6 số cuối thời gian (duy nhất mỗi lần thử)
  const params = {
    vnp_Version: '2.1.0', // phiên bản API
    vnp_Command: 'pay', // lệnh thanh toán
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn', // giao diện tiếng Việt
    vnp_CurrCode: 'VND', // đơn vị tiền
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`, // nội dung thanh toán (không dấu)
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(order.grandTotal) * 100, // VNPay tính theo đơn vị 1/100 đồng
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1', // IP của khách
    vnp_CreateDate: vnTime(now), // thời điểm tạo
    vnp_ExpireDate: vnTime(new Date(now.getTime() + 15 * 60 * 1000)) // link hết hạn sau 15 phút
  };
  const { query, hash } = signedQuery(params, hashSecret); // ký các tham số
  return { txnRef, createDate: params.vnp_CreateDate, paymentUrl: `${url}?${query}&vnp_SecureHash=${hash}` }; // link đầy đủ = cổng + tham số + chữ ký
}

// Kiểm tra chữ ký của dữ liệu VNPay gửi về (trang return và IPN). Trả về null nếu chữ ký sai.
async function verifyReturn(queryParams) {
  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = queryParams; // tách chữ ký ra, phần còn lại là dữ liệu được ký
  const cfg = await getConfig();
  if (!vnp_SecureHash || !isComplete(cfg)) return null; // không có chữ ký / chưa cấu hình -> từ chối
  const { hash } = signedQuery(rest, cfg.hashSecret); // tự tính lại chữ ký từ dữ liệu nhận được
  const a = Buffer.from(hash.toLowerCase()); // chữ ký tự tính
  const b = Buffer.from(String(vnp_SecureHash).toLowerCase()); // chữ ký VNPay gửi
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; // so sánh thời gian cố định (chống đoán chữ ký theo thời gian phản hồi)
  return {
    txnRef: rest.vnp_TxnRef, // mã giao dịch của mình
    amount: Number(rest.vnp_Amount) / 100, // đổi về đồng
    success: rest.vnp_ResponseCode === '00' && rest.vnp_TransactionStatus === '00', // thành công khi CẢ 2 mã đều là 00
    responseCode: rest.vnp_ResponseCode,
    transactionNo: rest.vnp_TransactionNo, // mã giao dịch phía VNPay
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
  if (cfg.source === 'simulator') return { ok: true, message: 'Đang dùng cổng VNPay GIẢ LẬP - không cần kết nối VNPay. Khách được chuyển tới trang thanh toán giả của TechShop.' }; // giả lập: luôn "kết nối được"
  if (!isComplete(cfg)) return { ok: false, message: 'Chưa nhập đủ Terminal ID và Secret Key' }; // thiếu thông tin
  const { paymentUrl } = await buildPaymentUrl({ order: { orderCode: 'TEST', grandTotal: 10000 }, cfg }); // link thử 10.000đ
  let res;
  try {
    res = await fetch(paymentUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) }); // mở link nhưng KHÔNG đi theo chuyển hướng, chờ tối đa 15 giây
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
  const location = res.headers.get('location') || ''; // VNPay chuyển hướng tới đâu
  const code = location.match(/Error\.html\?code=(\d+)/i)?.[1]; // chuyển tới trang lỗi -> lấy mã lỗi
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
  try { return `${new URL(payUrl).origin}/merchant_webapi/api/transaction`; } catch { return 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'; } // lấy tên miền của cổng + đường dẫn API
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
  constructor(message, code) { super(message); this.code = code; } // lỗi hoàn tiền kèm mã lỗi VNPay
}

// Hoàn tiền 1 giao dịch đã thanh toán. amount = số tiền hoàn (đồng); full = hoàn toàn bộ (02) hay một phần (03).
// Trả về { requestId, code, message, transactionNo } nếu VNPay chấp nhận (vnp_ResponseCode = 00), ném lỗi nếu không.
async function refund({ txnRef, transactionNo, transactionDate, amount, full = true, createBy, ipAddr, orderInfo, cfg, now = new Date() }) {
  const c = cfg || (await getConfig()); // cấu hình đang dùng
  if (c.source === 'simulator') {
    // Giả lập: VNPay "chấp nhận" ngay, không gọi ra ngoài
    return { requestId: `RFSIM${now.getTime()}`, code: '00', message: 'Hoàn tiền giả lập thành công', transactionNo: `SIM${require('./paymentSimulator').randomDigits(8)}` }; // giả lập: trả kết quả thành công ngay
  }
  if (!isComplete(c)) throw new VnpayRefundError('VNPay chưa được cấu hình'); // chưa cấu hình -> không hoàn được
  if (!txnRef || !transactionDate) throw new VnpayRefundError('Đơn thiếu thông tin giao dịch gốc (mã giao dịch / thời gian tạo) - không hoàn tự động được'); // thiếu thông tin giao dịch gốc
  const p = {
    vnp_RequestId: `RF${now.getTime()}${crypto.randomBytes(2).toString('hex')}`.slice(0, 32), // mã yêu cầu hoàn duy nhất (tối đa 32 ký tự)
    vnp_Version: '2.1.0',
    vnp_Command: 'refund', // lệnh hoàn tiền
    vnp_TmnCode: c.tmnCode,
    vnp_TransactionType: full ? '02' : '03', // 02 = hoàn toàn bộ, 03 = hoàn một phần
    vnp_TxnRef: txnRef,
    vnp_Amount: Math.round(amount) * 100, // số tiền hoàn (đơn vị 1/100 đồng)
    vnp_TransactionNo: transactionNo || '0', // mã giao dịch VNPay của lần thanh toán gốc
    vnp_TransactionDate: transactionDate, // thời điểm tạo giao dịch gốc (vnp_CreateDate đã lưu)
    vnp_CreateBy: String(createBy || 'admin').slice(0, 250), // người yêu cầu hoàn
    vnp_CreateDate: vnTime(now),
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_OrderInfo: orderInfo || `Hoan tien giao dich ${txnRef}`
  };
  // Chữ ký API: các trường nối bằng "|" theo đúng thứ tự tài liệu VNPay, HMAC-SHA512
  const signData = [p.vnp_RequestId, p.vnp_Version, p.vnp_Command, p.vnp_TmnCode, p.vnp_TransactionType, p.vnp_TxnRef,
    p.vnp_Amount, p.vnp_TransactionNo, p.vnp_TransactionDate, p.vnp_CreateBy, p.vnp_CreateDate, p.vnp_IpAddr, p.vnp_OrderInfo].join('|');
  p.vnp_SecureHash = crypto.createHmac('sha512', c.hashSecret).update(Buffer.from(signData, 'utf-8')).digest('hex'); // ký yêu cầu

  let res;
  try {
    res = await fetch(apiUrlFrom(c.url), { // gửi yêu cầu hoàn tiền tới VNPay
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(20000) // chờ tối đa 20 giây
    });
  } catch (err) {
    throw new VnpayRefundError(`Không kết nối được tới VNPay (${err.cause?.code || err.name}) - chưa biết kết quả, hãy kiểm tra trên trang merchant trước khi thử lại`, 'NETWORK');
  }
  const data = await res.json().catch(() => null); // đọc JSON phản hồi (lỗi -> null)
  if (!data) throw new VnpayRefundError(`VNPay phản hồi không hợp lệ (HTTP ${res.status})`, 'BAD_RESPONSE');
  // Kiểm tra chữ ký phản hồi để chắc chắn dữ liệu đến từ VNPay
  if (data.vnp_SecureHash) {
    const respData = [data.vnp_ResponseId, data.vnp_Command, data.vnp_ResponseCode, data.vnp_Message, data.vnp_TmnCode, data.vnp_TxnRef,
      data.vnp_Amount, data.vnp_BankCode, data.vnp_PayDate, data.vnp_TransactionNo, data.vnp_TransactionType, data.vnp_TransactionStatus,
      data.vnp_OrderInfo].map((v) => v ?? '').join('|');
    const expected = crypto.createHmac('sha512', c.hashSecret).update(Buffer.from(respData, 'utf-8')).digest('hex'); // tự tính chữ ký phản hồi
    if (expected.toLowerCase() !== String(data.vnp_SecureHash).toLowerCase()) { // không khớp -> phản hồi giả mạo
      throw new VnpayRefundError('Chữ ký phản hồi từ VNPay không hợp lệ', 'BAD_SIGNATURE');
    }
  }
  const code = String(data.vnp_ResponseCode ?? ''); // mã kết quả hoàn tiền
  if (code !== '00') throw new VnpayRefundError(REFUND_ERRORS[code] || data.vnp_Message || `VNPay từ chối hoàn tiền (mã ${code})`, code); // khác 00 = VNPay từ chối
  return { requestId: p.vnp_RequestId, code, message: data.vnp_Message || 'Thành công', transactionNo: data.vnp_TransactionNo }; // hoàn tiền thành công
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
