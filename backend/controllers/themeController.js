const mongoose = require('mongoose');
const ThemeTemplate = require('../models/ThemeTemplate');
const asyncHandler = require('../utils/asyncHandler');
const { BUILT_IN_TEMPLATES, parseTheme } = require('../utils/themes');

// Nạp các template có sẵn còn thiếu (so theo builtInKey) - admin đã xóa template Noel/Tết/Mùa thu thì
// KHÔNG tự tạo lại (chỉ nạp khi collection còn trống); riêng bộ "Mặc định" luôn có.
async function ensureBuiltInTemplates() {
  const empty = (await ThemeTemplate.estimatedDocumentCount()) === 0;
  for (const t of BUILT_IN_TEMPLATES) {
    if (!empty && t.key !== 'default') continue;
    if (await ThemeTemplate.exists({ builtInKey: t.key })) continue;
    const name = (await ThemeTemplate.exists({ name: t.name })) ? `${t.name} (hệ thống)` : t.name;
    await ThemeTemplate.create({ name, description: t.description, builtInKey: t.key, theme: t.theme });
  }
}

const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// @route GET /api/settings/themes (admin)
const getThemeTemplates = asyncHandler(async (req, res) => {
  await ensureBuiltInTemplates();
  // Bộ mặc định lên đầu, sau đó các template có sẵn, rồi template admin tạo (mới nhất trước)
  const list = await ThemeTemplate.find().sort({ createdAt: 1 }).lean();
  const order = (t) => (t.builtInKey === 'default' ? 0 : t.builtInKey ? 1 : 2);
  list.sort((a, b) => order(a) - order(b) || (order(a) === 2 ? b.createdAt - a.createdAt : 0));
  res.json({ data: list });
});

// @route POST /api/settings/themes (admin) - lưu bộ màu thành template mới
const createThemeTemplate = asyncHandler(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ message: 'Vui lòng đặt tên cho template' });
  if (name.length > 60) return res.status(400).json({ message: 'Tên template tối đa 60 ký tự' });
  const { error, theme } = parseTheme(req.body.theme);
  if (error) return res.status(400).json({ message: error });
  if (await ThemeTemplate.exists({ name })) return res.status(400).json({ message: 'Đã có template trùng tên' });
  const template = await ThemeTemplate.create({
    name,
    description: cleanName(req.body.description).slice(0, 200),
    theme,
    createdBy: req.account._id
  });
  res.status(201).json({ message: `Đã lưu template "${name}"`, data: template });
});

// @route PUT /api/settings/themes/:id (admin) - đổi tên / cập nhật bộ màu của template
const updateThemeTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy template' });
  const template = await ThemeTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ message: 'Không tìm thấy template' });
  if (template.builtInKey === 'default') {
    return res.status(400).json({ message: 'Không sửa được bộ màu mặc định - hãy lưu thành template mới' });
  }
  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ message: 'Vui lòng đặt tên cho template' });
    if (await ThemeTemplate.exists({ name, _id: { $ne: template._id } })) {
      return res.status(400).json({ message: 'Đã có template trùng tên' });
    }
    template.name = name;
  }
  if (req.body.description !== undefined) template.description = cleanName(req.body.description).slice(0, 200);
  if (req.body.theme !== undefined) {
    const { error, theme } = parseTheme(req.body.theme);
    if (error) return res.status(400).json({ message: error });
    template.theme = theme;
  }
  await template.save();
  res.json({ message: `Đã cập nhật template "${template.name}"`, data: template });
});

// @route DELETE /api/settings/themes/:id (admin)
const deleteThemeTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy template' });
  const template = await ThemeTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ message: 'Không tìm thấy template' });
  if (template.builtInKey === 'default') return res.status(400).json({ message: 'Không xóa được bộ màu mặc định' });
  await template.deleteOne();
  res.json({ message: `Đã xóa template "${template.name}"` });
});

module.exports = { getThemeTemplates, createThemeTemplate, updateThemeTemplate, deleteThemeTemplate, ensureBuiltInTemplates };
