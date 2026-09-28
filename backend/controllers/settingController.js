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
  const { _id, createdAt, updatedAt, __v, socialLinks, seo, theme, ...allowedFields } = req.body;
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

module.exports = { getSettings, updateSettings };
