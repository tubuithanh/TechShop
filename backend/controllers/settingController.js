const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');

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
  const { _id, createdAt, updatedAt, __v, socialLinks, seo, ...allowedFields } = req.body;
  Object.assign(settings, allowedFields);
  // socialLinks/seo là object lồng nhau - Object.assign(settings, {socialLinks:{facebook:'x'}}) sẽ
  // THAY THẾ TOÀN BỘ subdocument, xoá mất các field khác (zalo/youtube/instagram) về mặc định rỗng
  // nếu client chỉ gửi 1 field trong đó. Gộp (merge) thủ công thay vì ghi đè cả object.
  if (socialLinks) settings.socialLinks = { ...settings.toObject().socialLinks, ...socialLinks };
  if (seo) settings.seo = { ...settings.toObject().seo, ...seo };
  await settings.save();
  res.json({ data: settings });
});

module.exports = { getSettings, updateSettings };
