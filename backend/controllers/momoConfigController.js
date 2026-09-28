const PaymentConfig = require('../models/PaymentConfig');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt, decrypt, keySource } = require('../utils/secretBox');
const momo = require('../utils/momo');

const MODES = ['env', 'custom', 'off'];
const URL_RE = /^https?:\/\/[^\s]+$/i;

function ipnUrl(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/payments/momo/ipn`;
}

// Dữ liệu trả về trình duyệt: KHÔNG kèm Secret Key, chỉ cho biết đã lưu hay chưa
function publicView(doc, req) {
  const d = doc || {};
  const env = momo.configFromEnv();
  return {
    momoMode: d.momoMode || 'env',
    momoPartnerCode: d.momoPartnerCode || '',
    momoAccessKey: d.momoAccessKey || '',
    hasSecretKey: Boolean(d.momoSecretKeyEnc),
    secretUnreadable: Boolean(d.momoSecretKeyEnc && !decrypt(d.momoSecretKeyEnc)),
    momoEndpoint: d.momoEndpoint || '',
    momoRedirectUrl: d.momoRedirectUrl || '',
    momoIpnUrl: d.momoIpnUrl || '',
    defaultEndpoint: momo.DEFAULT_ENDPOINT,
    defaultRedirectUrl: momo.defaultRedirectUrl(),
    defaultIpnUrl: ipnUrl(req),
    envConfigured: Boolean(env.partnerCode && env.accessKey && env.secretKey),
    envPartnerCode: env.partnerCode,
    limits: { min: momo.MIN_AMOUNT, max: momo.MAX_AMOUNT },
    encryptionKey: keySource(),
    updatedAt: d.updatedAt || null
  };
}

// Kiểm tra dữ liệu gửi lên; trả về { error } hoặc { values } (secretKey rỗng = giữ Secret Key cũ)
function parseBody(body, existing) {
  const momoMode = MODES.includes(body.momoMode) ? body.momoMode : null;
  if (!momoMode) return { error: 'Chế độ cấu hình MoMo không hợp lệ' };
  const values = {
    momoMode,
    momoPartnerCode: String(body.momoPartnerCode || '').trim(),
    momoAccessKey: String(body.momoAccessKey || '').trim(),
    secretKey: typeof body.momoSecretKey === 'string' ? body.momoSecretKey.trim() : '',
    momoEndpoint: String(body.momoEndpoint || '').trim(),
    momoRedirectUrl: String(body.momoRedirectUrl || '').trim(),
    momoIpnUrl: String(body.momoIpnUrl || '').trim()
  };
  if (values.momoPartnerCode && !/^[A-Za-z0-9_-]{2,50}$/.test(values.momoPartnerCode)) return { error: 'Partner Code chỉ gồm chữ, số, "-", "_"' };
  if (values.momoAccessKey && !/^[A-Za-z0-9]{4,100}$/.test(values.momoAccessKey)) return { error: 'Access Key không hợp lệ' };
  for (const [k, label] of [['momoEndpoint', 'Địa chỉ cổng thanh toán'], ['momoRedirectUrl', 'Redirect URL'], ['momoIpnUrl', 'IPN URL']]) {
    if (values[k] && !URL_RE.test(values[k])) return { error: `${label} phải bắt đầu bằng http:// hoặc https://` };
  }
  if (momoMode === 'custom') {
    if (!values.momoPartnerCode) return { error: 'Vui lòng nhập Partner Code' };
    if (!values.momoAccessKey) return { error: 'Vui lòng nhập Access Key' };
    if (!values.secretKey && !(existing?.momoSecretKeyEnc && decrypt(existing.momoSecretKeyEnc))) {
      return { error: 'Vui lòng nhập Secret Key' };
    }
  }
  return { values };
}

function mergeDoc(existing, v) {
  return {
    momoMode: v.momoMode,
    momoPartnerCode: v.momoPartnerCode,
    momoAccessKey: v.momoAccessKey,
    momoSecretKeyEnc: v.secretKey ? encrypt(v.secretKey) : existing?.momoSecretKeyEnc || '',
    momoEndpoint: v.momoEndpoint,
    momoRedirectUrl: v.momoRedirectUrl,
    momoIpnUrl: v.momoIpnUrl
  };
}

// @route GET /api/settings/payment/momo
const getMomoConfig = asyncHandler(async (req, res) => {
  res.json({ data: publicView(await PaymentConfig.findOne().lean(), req) });
});

// @route PUT /api/settings/payment/momo - chỉ ghi các trường MoMo, không đụng cấu hình VNPay
const updateMomoConfig = asyncHandler(async (req, res) => {
  const existing = await PaymentConfig.findOne();
  const { error, values } = parseBody(req.body, existing);
  if (error) return res.status(400).json({ message: error });
  const doc = await PaymentConfig.findOneAndUpdate(
    {},
    { $set: { ...mergeDoc(existing, values), updatedBy: req.account._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  momo.clearMomoConfigCache();
  res.json({ message: 'Đã lưu cấu hình thanh toán MoMo', data: publicView(doc, req) });
});

// @route POST /api/settings/payment/momo/test - kiểm tra thông tin ĐANG NHẬP (chưa cần lưu)
const testMomoConfig = asyncHandler(async (req, res) => {
  const existing = await PaymentConfig.findOne().lean();
  const { error, values } = parseBody(req.body, existing);
  if (error) return res.status(400).json({ message: error });
  if (values.momoMode === 'off') return res.status(400).json({ message: 'Thanh toán MoMo đang tắt' });
  const result = await momo.testConnection(momo.configFromDoc(mergeDoc(existing, values)));
  res.status(result.ok ? 200 : 400).json(result);
});

module.exports = { getMomoConfig, updateMomoConfig, testMomoConfig };
