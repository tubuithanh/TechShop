const PermissionGroup = require('../models/PermissionGroup');
const Admin = require('../models/Admin');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/permission-groups/catalog - danh mục quyền cố định của hệ thống (để render
// checkbox chọn quyền ở giao diện quản trị) - public cho mọi admin/staff đã đăng nhập đọc được.
const getCatalog = asyncHandler(async (req, res) => {
  res.json({ data: PermissionGroup.PERMISSIONS });
});

const getGroups = asyncHandler(async (req, res) => {
  const groups = await PermissionGroup.find().sort({ name: 1 });
  res.json({ data: groups });
});

const createGroup = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Vui lòng nhập tên nhóm quyền' });
  const invalid = (permissions || []).filter((p) => !PermissionGroup.PERMISSION_KEYS.includes(p));
  if (invalid.length) return res.status(400).json({ message: `Quyền không hợp lệ: ${invalid.join(', ')}` });
  try {
    const group = await PermissionGroup.create({ name: name.trim(), description, permissions: permissions || [] });
    res.status(201).json({ data: group });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Tên nhóm quyền đã tồn tại' });
    throw err;
  }
});

const updateGroup = asyncHandler(async (req, res) => {
  const group = await PermissionGroup.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm quyền' });
  const { name, description, permissions } = req.body;
  if (permissions !== undefined) {
    const invalid = permissions.filter((p) => !PermissionGroup.PERMISSION_KEYS.includes(p));
    if (invalid.length) return res.status(400).json({ message: `Quyền không hợp lệ: ${invalid.join(', ')}` });
    group.permissions = permissions;
  }
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: 'Tên nhóm quyền không được để trống' });
    group.name = name.trim();
  }
  if (description !== undefined) group.description = description;
  try {
    await group.save();
    res.json({ data: group });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Tên nhóm quyền đã tồn tại' });
    throw err;
  }
});

const deleteGroup = asyncHandler(async (req, res) => {
  const group = await PermissionGroup.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm quyền' });
  // Chặn xóa nhóm quyền còn nhân viên đang được gán - tránh 1 staff đột nhiên mất hết quyền vì
  // nhóm của họ biến mất mà không ai biết.
  const staffCount = await Admin.countDocuments({ groupIds: group._id });
  if (staffCount > 0) {
    return res.status(400).json({ message: `Không thể xóa - còn ${staffCount} nhân viên đang thuộc nhóm này` });
  }
  await group.deleteOne();
  res.json({ message: 'Đã xóa nhóm quyền' });
});

module.exports = { getCatalog, getGroups, createGroup, updateGroup, deleteGroup };
