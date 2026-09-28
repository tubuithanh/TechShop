const crypto = require('crypto');
const PaymentConfig = require('../models/PaymentConfig');
const { decrypt } = require('./secretBox');

// Tích hợp cổng thanh toán MoMo (API v2 - "payWithMethod": khách tự chọn ví MoMo / thẻ ATM / thẻ quốc tế
// trên trang MoMo). Tài liệu: https://developers.momo.vn. Cấu hình ở Admin -> Cấu hình hệ thống -> Cấu hình
// thanh toán MoMo, hoặc biến môi trường MOMO_*.
// Môi trường thử nghiệm có bộ khóa công khai trong code mẫu của MoMo (partnerCode MOMO) - dùng được ngay.
const DEFAULT_ENDPOINT = 'https://test-payment.momo.vn';
const REQUEST_TYPE = 'payWithMethod';
// Giới hạn số tiền mỗi giao dịch của MoMo (đã kiểm tra với môi trường thử nghiệm)
const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 50000000;
const defaultRedirectUrl = () => `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/momo-return`;

function configFromEnv() {
  return {
    source: 'env',
    partnerCode: process.env.MOMO_PARTNER_CODE || '',
    accessKey: process.env.MOMO_ACCESS_KEY || '',
    secretKey: process.env.MOMO_SECRET_KEY || '',
    endpoint: process.env.MOMO_ENDPOINT || DEFAULT_ENDPOINT,
    redirectUrl: process.env.MOMO_REDIRECT_URL || defaultRedirectUrl(),
    ipnUrl: process.env.MOMO_IPN_URL || ''
  };
}

function configFromDoc(doc) {
  if (!doc || !doc.momoMode || doc.momoMode === 'env') return configFromEnv();
  if (doc.momoMode === 'off') {
    return { source: 'off', partnerCode: '', accessKey: '', secretKey: '', endpoint: DEFAULT_ENDPOINT, redirectUrl: defaultRedirectUrl(), ipnUrl: '' };
  }
  return {
    source: 'custom',
    partnerCode: doc.momoPartnerCode || '',
    accessKey: doc.momoAccessKey || '',
    secretKey: decrypt(doc.momoSecretKeyEnc) || '',
    endpoint: doc.momoEndpoint || DEFAULT_ENDPOINT,
    redirectUrl: doc.momoRedirectUrl || defaultRedirectUrl(),
    ipnUrl: doc.momoIpnUrl || ''
  };
}

// Bộ nhớ đệm 30 giây cho bản ghi cấu hình (biến môi trường luôn đọc mới)
const CACHE_MS = 30 * 1000;
let cache = null;
async function getConfig() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { doc: await PaymentConfig.findOne().lean(), at: Date.now() };
  }
  return configFromDoc(cache.doc);
}
function clearMomoConfigCache() {
  cache = null;
}

const isComplete = (cfg) => Boolean(cfg.partnerCode && cfg.accessKey && cfg.secretKey);
const isConfigured = async () => isComplete(await getConfig());

const hmac = (raw, secret) => crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');

// Chuỗi ký khi TẠO thanh toán - đúng thứ tự khóa theo bảng chữ cái như MoMo quy định
function createSignature(p, cfg) {
  const raw =
    `accessKey=${cfg.accessKey}&amount=${p.amount}&extraData=${p.extraData}&ipnUrl=${p.ipnUrl}` +
    `&orderId=${p.orderId}&orderInfo=${p.orderInfo}&partnerCode=${cfg.partnerCode}` +
    `&redirectUrl=${p.redirectUrl}&requestId=${p.requestId}&requestType=${p.requestType}`;
  return hmac(raw, cfg.secretKey);
}

// Chuỗi ký của KẾT QUẢ MoMo gửi về (trang redirect và IPN)
const RESULT_FIELDS = ['amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'];
function resultSignature(params, cfg) {
  const raw = `accessKey=${cfg.accessKey}&` + RESULT_FIELDS.map((k) => `${k}=${params[k] ?? ''}`).join('&');
  return hmac(raw, cfg.secretKey);
}

class MomoError extends Error {
  constructor(message, resultCode) {
    super(message);
    this.resultCode = resultCode;
  }
}

async function callCreate(body, cfg) {
  let res;
  try {
    res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}/v2/gateway/api/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
  } catch (err) {
    throw new MomoError(`Không kết nối được tới MoMo (${err.cause?.code || err.name})`);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new MomoError(`MoMo phản hồi không hợp lệ (HTTP ${res.status})`);
  }
  if (data.resultCode !== 0 || !data.payUrl) {
    // Bỏ phần "dữ liệu gốc" MoMo in kèm khi sai chữ ký (có thể chứa thông tin cấu hình)
    const msg = String(data.message || 'MoMo từ chối yêu cầu').replace(/\s*Vui lòng kiểm tra dữ liệu gốc[\s\S]*$/i, '').trim();
    throw new MomoError(msg, data.resultCode);
  }
  return data;
}

// Tạo link thanh toán cho đơn hàng. Mỗi lần thử dùng 1 mã giao dịch (orderId của MoMo) MỚI - MoMo từ chối
// mã đã dùng. ipnUrl: địa chỉ MoMo gọi báo kết quả (mặc định lấy theo địa chỉ máy chủ đang chạy).
async function createPayment({ order, ipnUrl, cfg, now = new Date() }) {
  const c = cfg || (await getConfig());
  const amount = Math.round(order.grandTotal);
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new MomoError(`MoMo chỉ hỗ trợ đơn hàng từ ${MIN_AMOUNT.toLocaleString('vi-VN')}đ đến ${MAX_AMOUNT.toLocaleString('vi-VN')}đ`);
  }
  const txnRef = `${String(order.orderCode).replace(/[^0-9a-zA-Z]/g, '')}MM${now.getTime()}${crypto.randomInt(100, 999)}`;
  const p = {
    orderId: txnRef,
    requestId: txnRef,
    amount: String(amount),
    orderInfo: `Thanh toan don hang ${order.orderCode}`,
    redirectUrl: c.redirectUrl,
    ipnUrl: c.ipnUrl || ipnUrl,
    requestType: REQUEST_TYPE,
    extraData: ''
  };
  const data = await callCreate({ partnerCode: c.partnerCode, accessKey: c.accessKey, ...p, lang: 'vi', signature: createSignature(p, c) }, c);
  return { txnRef, paymentUrl: data.payUrl };
}

// Kiểm tra chữ ký kết quả MoMo gửi về (query của trang redirect hoặc body JSON của IPN). Sai chữ ký -> null.
async function verifyResult(params) {
  const cfg = await getConfig();
  if (!params || typeof params.signature !== 'string' || !isComplete(cfg)) return null;
  if (String(params.partnerCode) !== cfg.partnerCode) return null;
  const expected = Buffer.from(resultSignature(params, cfg));
  const got = Buffer.from(params.signature.toLowerCase());
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  const resultCode = Number(params.resultCode);
  return {
    txnRef: String(params.orderId),
    amount: Number(params.amount),
    // 0 = thành công; 9000 = đã được xác nhận (với giao dịch tự động hoàn tất cũng coi là thành công)
    success: resultCode === 0 || resultCode === 9000,
    responseCode: String(params.resultCode),
    transactionNo: params.transId ? String(params.transId) : undefined,
    bankCode: params.payType ? String(params.payType) : undefined,
    message: params.message ? String(params.message) : ''
  };
}

// Kiểm tra kết nối: tạo thử 1 yêu cầu thanh toán 10.000đ (không trừ tiền - chỉ tạo link)
async function testConnection(cfg) {
  if (!isComplete(cfg)) return { ok: false, message: 'Chưa nhập đủ Partner Code, Access Key và Secret Key' };
  try {
    await createPayment({ order: { orderCode: 'TEST', grandTotal: 10000 }, ipnUrl: 'https://example.com/api/payments/momo/ipn', cfg });
    return { ok: true, message: 'Kết nối MoMo thành công - Partner Code, Access Key và Secret Key hợp lệ' };
  } catch (err) {
    const hint = err.resultCode === 11007 ? ' (Access Key / Secret Key không đúng)' : '';
    return { ok: false, message: `${err.message}${hint}` };
  }
}

module.exports = {
  isConfigured,
  getConfig,
  configFromEnv,
  configFromDoc,
  clearMomoConfigCache,
  createPayment,
  verifyResult,
  resultSignature,
  testConnection,
  MomoError,
  DEFAULT_ENDPOINT,
  defaultRedirectUrl,
  MIN_AMOUNT,
  MAX_AMOUNT
};
