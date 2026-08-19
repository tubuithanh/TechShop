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
  const { _id, createdAt, updatedAt, __v, ...allowedFields } = req.body;
  Object.assign(settings, allowedFields);
  await settings.save();
  res.json({ data: settings });
});

module.exports = { getSettings, updateSettings };
