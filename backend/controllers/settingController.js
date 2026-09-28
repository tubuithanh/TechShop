const {
  clearRateLimitCache,
  parseLimits,
  effectiveLimits,
  LIMIT_RULES,
  MAX_LIMIT,
  WINDOW_MINUTES
} = require('../middlewares/rateLimits');
const { clearRetentionCache, purgeOldAuditLogs } = require('../utils/auditRetention');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');
const { parseTheme } = require('../utils/themes');

async function getOrCreateSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

// @route GET /api/settings - public (Header/Footer/trang chủ cần đọc mà không cần đăng nhập)
const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ data: settings });
});

// @route PUT /api/settings - chỉ admin (không cho staff vì đây là cấu hình toàn hệ thống)
const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  // rateLimitEnabled / rateLimits đổi riêng qua /api/settings/security, không nhận ở đây
  const { _id, createdAt, updatedAt, __v, socialLinks, seo, theme, rateLimitEnabled, rateLimits, ...allowedFields } = req.body;
  // Bộ màu: kiểm tra mã màu trước khi ghi (gửi thiếu trường nào thì giữ giá trị cũ của trường đó)
  let themePatch = null;
  if (theme !== undefined) {
    const parsed = parseTheme(theme, { partial: true });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    themePatch = parsed.theme;
  }
  Object.assign(settings, allowedFields);
  // socialLinks/seo là object lồng nhau - Object.assign(settings, {socialLinks:{facebook:'x'}}) sẽ
  // THAY THẾ TOÀN BỘ subdocument, xoá mất các field khác (zalo/youtube/instagram) về mặc định rỗng
  // nếu client chỉ gửi 1 field trong đó. Gộp (merge) thủ công thay vì ghi đè cả object.
  if (socialLinks) settings.socialLinks = { ...settings.toObject().socialLinks, ...socialLinks };
  if (seo) settings.seo = { ...settings.toObject().seo, ...seo };
  if (themePatch) settings.theme = { ...settings.toObject().theme, ...themePatch };
  await settings.save();
  // Đổi số ngày lưu nhật ký -> áp dụng ngay (không chờ bộ nhớ đệm hết hạn) và dọn nhật ký quá hạn luôn
  clearRetentionCache();
  await purgeOldAuditLogs();
  res.json({ data: settings });
});

// Dữ liệu tab Bảo mật: trạng thái bật/tắt + số lần cho phép từng nhóm (kèm mặc định, min/max để hiển thị)
function securityView(setting) {
  const limits = effectiveLimits(setting?.rateLimits);
  return {
    rateLimitEnabled: setting?.rateLimitEnabled !== false,
    envDisabled: process.env.RATE_LIMIT_DISABLED === 'true',
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
  if (rateLimitEnabled === undefined && limits === undefined) {
    return res.status(400).json({ message: 'Không có thay đổi nào' });
  }
  if (rateLimitEnabled !== undefined && typeof rateLimitEnabled !== 'boolean') {
    return res.status(400).json({ message: 'Giá trị bật/tắt không hợp lệ' });
  }
  let parsed = null;
  if (limits !== undefined) {
    parsed = parseLimits(limits);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
  }
  await getOrCreateSettings();
  const current = await Setting.findOne().select('+rateLimits').lean();
  const $set = {};
  if (rateLimitEnabled !== undefined) $set.rateLimitEnabled = rateLimitEnabled;
  if (parsed) $set.rateLimits = { ...effectiveLimits(current?.rateLimits), ...parsed.limits };
  await Setting.updateOne({}, { $set });
  clearRateLimitCache(); // áp dụng ngay, không chờ bộ nhớ đệm hết hạn

  const setting = await Setting.findOne().select('+rateLimitEnabled +rateLimits').lean();
  let message = 'Đã lưu các giới hạn';
  if (rateLimitEnabled !== undefined) {
    message = rateLimitEnabled ? 'Đã BẬT chống lạm dụng & tấn công dồn dập' : 'Đã TẮT chống lạm dụng & tấn công dồn dập';
  }
  res.json({ message, data: securityView(setting) });
});

module.exports = { getSettings, updateSettings, getSecuritySettings, updateSecuritySettings };
