const PaymentConfig = require('../models/PaymentConfig');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt, decrypt, keySource } = require('../utils/secretBox');
const vnpay = require('../utils/vnpay');

const MODES = ['env', 'custom', 'off'];
const URL_RE = /^https?:\/\/[^\s]+$/i;

function ipnUrl(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/payments/vnpay/ipn`;
}

// Dữ liệu trả về trình duyệt: KHÔNG kèm Secret Key, chỉ cho biết đã lưu hay chưa
function publicView(doc, req) {
  const d = doc || {};
  const env = vnpay.configFromEnv();
  return {
    vnpayMode: d.vnpayMode || 'env',
    vnpTmnCode: d.vnpTmnCode || '',
    hasHashSecret: Boolean(d.vnpHashSecretEnc),
    // Secret Key đã lưu nhưng không giải mã được (khóa mã hóa trên máy chủ đã đổi) -> admin cần nhập lại
    secretUnreadable: Boolean(d.vnpHashSecretEnc && !decrypt(d.vnpHashSecretEnc)),
    vnpUrl: d.vnpUrl || '',
    vnpReturnUrl: d.vnpReturnUrl || '',
    defaultUrl: vnpay.DEFAULT_URL,
    defaultReturnUrl: vnpay.defaultReturnUrl(),
    ipnUrl: ipnUrl(req),
    envConfigured: Boolean(env.tmnCode && env.hashSecret), // có biến môi trường VNP_* trên máy chủ không
    envTmnCode: env.tmnCode ? `${env.tmnCode.slice(0, 2)}******` : '',
    encryptionKey: keySource(),
    updatedAt: d.updatedAt || null
  };
}

// Kiểm tra dữ liệu gửi lên; trả về { error } hoặc { values } (hashSecret rỗng = giữ Secret Key cũ)
function parseBody(body, existing) {
  const vnpayMode = MODES.includes(body.vnpayMode) ? body.vnpayMode : null;
  if (!vnpayMode) return { error: 'Chế độ cấu hình VNPay không hợp lệ' };
  const values = {
    vnpayMode,
    vnpTmnCode: String(body.vnpTmnCode || '').trim(),
    hashSecret: typeof body.vnpHashSecret === 'string' ? body.vnpHashSecret.trim() : '',
    vnpUrl: String(body.vnpUrl || '').trim(),
    vnpReturnUrl: String(body.vnpReturnUrl || '').trim()
  };
  if (values.vnpTmnCode && !/^[A-Za-z0-9]{4,20}$/.test(values.vnpTmnCode)) {
    return { error: 'Terminal ID (vnp_TmnCode) chỉ gồm chữ và số, 4-20 ký tự' };
  }
  if (values.vnpUrl && !URL_RE.test(values.vnpUrl)) return { error: 'Địa chỉ cổng thanh toán phải bắt đầu bằng http:// hoặc https://' };
  if (values.vnpReturnUrl && !URL_RE.test(values.vnpReturnUrl)) return { error: 'Return URL phải bắt đầu bằng http:// hoặc https://' };
  if (vnpayMode === 'custom') {
    if (!values.vnpTmnCode) return { error: 'Vui lòng nhập Terminal ID (vnp_TmnCode)' };
    if (!values.hashSecret && !(existing?.vnpHashSecretEnc && decrypt(existing.vnpHashSecretEnc))) {
      return { error: 'Vui lòng nhập Secret Key (vnp_HashSecret)' };
    }
  }
  return { values };
}

function mergeDoc(existing, v) {
  return {
    vnpayMode: v.vnpayMode,
    vnpTmnCode: v.vnpTmnCode,
    vnpHashSecretEnc: v.hashSecret ? encrypt(v.hashSecret) : existing?.vnpHashSecretEnc || '',
    vnpUrl: v.vnpUrl,
    vnpReturnUrl: v.vnpReturnUrl
  };
}

// @route GET /api/settings/payment
const getPaymentConfig = asyncHandler(async (req, res) => {
  const doc = await PaymentConfig.findOne().lean();
  res.json({ data: publicView(doc, req) });
});

// @route PUT /api/settings/payment
const updatePaymentConfig = asyncHandler(async (req, res) => {
  const existing = await PaymentConfig.findOne();
  const { error, values } = parseBody(req.body, existing);
  if (error) return res.status(400).json({ message: error });
  const doc = await PaymentConfig.findOneAndUpdate(
    {},
    { ...mergeDoc(existing, values), updatedBy: req.account._id },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  vnpay.clearPaymentConfigCache();
  res.json({ message: 'Đã lưu cấu hình thanh toán VNPay', data: publicView(doc, req) });
});

// @route POST /api/settings/payment/test - kiểm tra thông tin ĐANG NHẬP (chưa cần lưu)
const testPaymentConfig = asyncHandler(async (req, res) => {
  const existing = await PaymentConfig.findOne().lean();
  const { error, values } = parseBody(req.body, existing);
  if (error) return res.status(400).json({ message: error });
  if (values.vnpayMode === 'off') return res.status(400).json({ message: 'Thanh toán VNPay đang tắt' });
  const cfg = vnpay.configFromDoc(mergeDoc(existing, values));
  const result = await vnpay.testConnection(cfg);
  res.status(result.ok ? 200 : 400).json({ ...result });
});

module.exports = { getPaymentConfig, updatePaymentConfig, testPaymentConfig };
