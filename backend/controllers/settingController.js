const {
  clearRateLimitCache,
  parseLimits,
  effectiveLimits,
  LIMIT_RULES,
  MAX_LIMIT,
  WINDOW_MINUTES
} = require('../middlewares/rateLimits');
const { clearRetentionCache, purgeOldAuditLogs } = require('../utils/auditRetention'); // số ngày lưu nhật ký
const Setting = require('../models/Setting'); // bản ghi cấu hình duy nhất
const asyncHandler = require('../utils/asyncHandler');
const { parseTheme } = require('../utils/themes'); // kiểm tra bộ màu
const { parseFooter } = require('../utils/footer'); // kiểm tra chân trang

async function getOrCreateSettings() {
  let settings = await Setting.findOne(); // chỉ có 1 bản ghi cấu hình
  if (!settings) settings = await Setting.create({}); // chưa có -> tạo với giá trị mặc định
  return settings;
}

// @route GET /api/settings - public (Header/Footer/trang chủ cần đọc mà không cần đăng nhập)
const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ data: settings });
});

// @route PUT /api/settings - chỉ admin (không cho staff vì đây là cấu hình toàn hệ thống)
const updateSettings = asyncHandler(async (req, res) => {
  if (req.body.shippingVatRate !== undefined && (typeof req.body.shippingVatRate !== 'number' || !Number.isFinite(req.body.shippingVatRate) || req.body.shippingVatRate<0 || req.body.shippingVatRate>100 || Math.abs(req.body.shippingVatRate*100-Math.round(req.body.shippingVatRate*100))>1e-8)) return res.status(400).json({ message:'VAT vận chuyển phải từ 0–100%, tối đa 2 chữ số thập phân' }); // VAT phí ship 0-100%, tối đa 2 chữ số thập phân
  if (req.body.vatRate !== undefined && (typeof req.body.vatRate !== 'number' || !Number.isFinite(req.body.vatRate) || req.body.vatRate < 0 || req.body.vatRate > 100 || Math.abs(req.body.vatRate * 100 - Math.round(req.body.vatRate * 100)) > 1e-8)) { // VAT mặc định, cùng quy tắc
    return res.status(400).json({ message: 'VAT phải từ 0 đến 100%, tối đa 2 chữ số thập phân' });
  }
  const settings = await getOrCreateSettings();
  // rateLimitEnabled / rateLimits đổi riêng qua /api/settings/security, không nhận ở đây
  // loyalty đổi riêng qua /api/settings/loyalty (có kiểm tra ngưỡng / màu), không nhận ở đây
  // SỬA LỖI: orderSla (ngưỡng quá hạn - /api/orders/admin/inbox/sla), einvoice (cấu hình hóa đơn riêng),
  // showDemoAccounts (/api/settings/demo-accounts), homeSlidesSeeded (cờ nội bộ) cũng có API / kiểm tra riêng.
  // Trước đây gửi chúng vào đây thì ghi thẳng không kiểm tra (orderSla kiểu Mixed sai -> hỏng trang "Việc cần làm").
  const { _id, createdAt, updatedAt, __v, socialLinks, seo, theme, footer, rateLimitEnabled, rateLimits, loyalty, orderSla, einvoice, showDemoAccounts, homeSlidesSeeded, ...allowedFields } = req.body;
  // Chân trang: kiểm tra đường dẫn / độ dài trước khi ghi
  let footerValue = null;
  if (footer !== undefined) {
    const parsedFooter = parseFooter(footer); // kiểm tra đường dẫn / độ dài
    if (parsedFooter.error) return res.status(400).json({ message: parsedFooter.error });
    footerValue = parsedFooter.footer;
  }
  // Bộ màu: kiểm tra mã màu trước khi ghi (gửi thiếu trường nào thì giữ giá trị cũ của trường đó)
  let themePatch = null;
  if (theme !== undefined) {
    const parsed = parseTheme(theme, { partial: true }); // chỉ đổi màu có gửi
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    themePatch = parsed.theme;
  }
  Object.assign(settings, allowedFields); // các trường đơn giản (Mongoose tự kiểm tra min / max theo schema)
  // socialLinks/seo là object lồng nhau - Object.assign(settings, {socialLinks:{facebook:'x'}}) sẽ
  // THAY THẾ TOÀN BỘ subdocument, xoá mất các field khác (zalo/youtube/instagram) về mặc định rỗng
  // nếu client chỉ gửi 1 field trong đó. Gộp (merge) thủ công thay vì ghi đè cả object.
  if (socialLinks) settings.socialLinks = { ...settings.toObject().socialLinks, ...socialLinks }; // gộp, không ghi đè cả object
  if (seo) settings.seo = { ...settings.toObject().seo, ...seo }; // gộp
  if (themePatch) settings.theme = { ...settings.toObject().theme, ...themePatch }; // gộp
  if (footerValue) settings.footer = footerValue;
  await settings.save();
  // Đổi số ngày lưu nhật ký -> áp dụng ngay (không chờ bộ nhớ đệm hết hạn) và dọn nhật ký quá hạn luôn
  clearRetentionCache(); // áp dụng ngay số ngày lưu nhật ký mới
  await purgeOldAuditLogs(); // dọn nhật ký quá hạn theo số ngày mới
  res.json({ data: settings });
});

// Dữ liệu tab Bảo mật: trạng thái bật/tắt + số lần cho phép từng nhóm (kèm mặc định, min/max để hiển thị)
function securityView(setting) {
  const limits = effectiveLimits(setting?.rateLimits); // số lần cho phép đang dùng
  return {
    rateLimitEnabled: setting?.rateLimitEnabled !== false,
    envDisabled: process.env.RATE_LIMIT_DISABLED === 'true', // đang bị tắt bằng biến môi trường?
    windowMinutes: WINDOW_MINUTES,
    limits: Object.entries(LIMIT_RULES).map(([key, r]) => ({
      key,
      label: r.label,
      value: limits[key],
      default: r.default,
      min: r.min,
      max: MAX_LIMIT
    }))
  };
}

// @route GET /api/settings/security - chỉ admin
const getSecuritySettings = asyncHandler(async (req, res) => {
  await getOrCreateSettings();
  const setting = await Setting.findOne().select('+rateLimitEnabled +rateLimits').lean();
  res.json({ data: securityView(setting) });
});

// @route PUT /api/settings/security - chỉ admin. Nhận { rateLimitEnabled?, limits? } (gửi phần nào đổi phần đó)
const updateSecuritySettings = asyncHandler(async (req, res) => {
  const { rateLimitEnabled, limits } = req.body;
  if (rateLimitEnabled === undefined && limits === undefined) { // không gửi gì
    return res.status(400).json({ message: 'Không có thay đổi nào' });
  }
  if (rateLimitEnabled !== undefined && typeof rateLimitEnabled !== 'boolean') {
    return res.status(400).json({ message: 'Giá trị bật/tắt không hợp lệ' });
  }
  let parsed = null;
  if (limits !== undefined) {
    parsed = parseLimits(limits); // kiểm tra từng giới hạn
    if (parsed.error) return res.status(400).json({ message: parsed.error });
  }
  await getOrCreateSettings();
  const current = await Setting.findOne().select('+rateLimits').lean();
  const $set = {};
  if (rateLimitEnabled !== undefined) $set.rateLimitEnabled = rateLimitEnabled;
  if (parsed) $set.rateLimits = { ...effectiveLimits(current?.rateLimits), ...parsed.limits }; // gộp giới hạn cũ + mới
  await Setting.updateOne({}, { $set }); // ghi
  clearRateLimitCache(); // áp dụng ngay, không chờ bộ nhớ đệm hết hạn

  const setting = await Setting.findOne().select('+rateLimitEnabled +rateLimits').lean();
  let message = 'Đã lưu các giới hạn';
  if (rateLimitEnabled !== undefined) {
    message = rateLimitEnabled ? 'Đã BẬT chống lạm dụng & tấn công dồn dập' : 'Đã TẮT chống lạm dụng & tấn công dồn dập';
  }
  res.json({ message, data: securityView(setting) });
});

// ---------- Hạng thành viên ----------
const User = require('../models/User');
const { effectiveConfig, parseLoyaltyConfig, tierKeyExpr, MIN_TIERS, MAX_TIERS } = require('../utils/loyalty');

// Số khách ở từng hạng theo cấu hình hiện tại (và theo bộ hạng mới nếu đang xem trước), kèm số khách đổi hạng
async function tierStats(currentTiers, nextTiers = currentTiers) {
  const rows = await User.aggregate([
    { $group: { _id: { from: tierKeyExpr(currentTiers), to: tierKeyExpr(nextTiers) }, count: { $sum: 1 } } } // đếm khách theo cặp (hạng cũ, hạng mới)
  ]);
  const count = (tiers, side) => tiers.map((t) => ({ key: t.key, name: t.name, color: t.color, count: rows.filter((r) => r._id[side] === t.key).reduce((s, r) => s + r.count, 0) })); // số khách mỗi hạng
  // Lên / xuống hạng: so vị trí của hạng cũ và hạng mới (thấp -> cao)
  const rankOld = new Map(currentTiers.map((t, i) => [t.key, i])); // thứ bậc hạng cũ
  const rankNew = new Map(nextTiers.map((t, i) => [t.key, i])); // thứ bậc hạng mới
  let up = 0;
  let down = 0;
  for (const r of rows) {
    const a = rankOld.get(r._id.from);
    const b = rankNew.get(r._id.to);
    if (r._id.from === r._id.to && a === b) continue;
    if (b > a) up += r.count; // lên hạng
    else if (b < a) down += r.count; // xuống hạng
  }
  return { current: count(currentTiers, 'from'), next: count(nextTiers, 'to'), up, down, total: rows.reduce((s, r) => s + r.count, 0) };
}

const loyaltyView = async (config) => ({ ...config, minTiers: MIN_TIERS, maxTiers: MAX_TIERS, stats: (await tierStats(config.tiers)).current });

// @route GET /api/settings/loyalty - chỉ admin: cấu hình + số khách mỗi hạng
const getLoyaltySettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ data: await loyaltyView(effectiveConfig(settings.loyalty)) });
});

// @route POST /api/settings/loyalty/preview - xem trước bộ hạng mới: bao nhiêu khách lên / xuống hạng (không lưu)
const previewLoyaltyTiers = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const current = effectiveConfig(settings.loyalty);
  const parsed = parseLoyaltyConfig({ tiers: req.body?.tiers }, current); // chỉ xem trước, không lưu
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  res.json({ data: await tierStats(current.tiers, parsed.config.tiers) });
});

// @route PUT /api/settings/loyalty - chỉ admin. Nhận { enabled?, pointValue?, tiers? } (gửi phần nào đổi phần đó)
const updateLoyaltySettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const parsed = parseLoyaltyConfig(req.body, effectiveConfig(settings.loyalty)); // kiểm tra
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  await Setting.updateOne({ _id: settings._id }, { $set: { loyalty: parsed.config } }); // lưu
  let message = 'Đã lưu cấu hình hạng thành viên';
  if (req.body.enabled !== undefined && Object.keys(req.body).length === 1) {
    message = req.body.enabled ? 'Đã BẬT tích điểm thành viên' : 'Đã TẮT tích điểm thành viên (điểm đã có được giữ nguyên)';
  }
  res.json({ message, data: await loyaltyView(parsed.config) });
});

module.exports = {
  getSettings,
  updateSettings,
  getSecuritySettings,
  updateSecuritySettings,
  getLoyaltySettings,
  previewLoyaltyTiers,
  updateLoyaltySettings
};
