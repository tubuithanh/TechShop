const PermissionGroup = require('../models/PermissionGroup'); // nhóm quyền (danh sách quyền chi tiết)
const Admin = require('../models/Admin'); // nhân viên
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/permission-groups/catalog - danh mục quyền cố định của hệ thống (để render
// checkbox chọn quyền ở giao diện quản trị) - public cho mọi admin/staff đã đăng nhập đọc được.
const getCatalog = asyncHandler(async (req, res) => {
  res.json({ data: PermissionGroup.PERMISSIONS }); // danh mục quyền cố định để vẽ ô chọn
});

const getGroups = asyncHandler(async (req, res) => {
  const groups = await PermissionGroup.find().sort({ name: 1 }); // theo tên A-Z
  res.json({ data: groups });
});

const createGroup = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Vui lòng nhập tên nhóm quyền' });
  // SỬA LỖI: permissions không phải mảng (VD chuỗi) trước đây làm .filter lỗi 500
  if (permissions !== undefined && !Array.isArray(permissions)) return res.status(400).json({ message: 'Danh sách quyền không hợp lệ' });
  const invalid = (permissions || []).filter((p) => !PermissionGroup.PERMISSION_KEYS.includes(p)); // quyền phải có trong danh mục
  if (invalid.length) return res.status(400).json({ message: `Quyền không hợp lệ: ${invalid.join(', ')}` });
  try {
    const group = await PermissionGroup.create({ name: name.trim(), description, permissions: permissions || [] }); // tạo nhóm
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
    if (!Array.isArray(permissions)) return res.status(400).json({ message: 'Danh sách quyền không hợp lệ' }); // SỬA LỖI: như trên
    const invalid = permissions.filter((p) => !PermissionGroup.PERMISSION_KEYS.includes(p)); // quyền phải có trong danh mục
    if (invalid.length) return res.status(400).json({ message: `Quyền không hợp lệ: ${invalid.join(', ')}` });
    group.permissions = permissions; // thay toàn bộ danh sách quyền (có hiệu lực ngay ở request kế tiếp)
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Tên nhóm quyền không được để trống' });
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
  if (group.code === 'customer_support') return res.status(400).json({ message: 'Nhóm CSKH được dùng cho chức năng chat, không thể xóa. Bạn có thể sửa tên hoặc quyền.' }); // nhóm hệ thống dùng cho chat
  // Chặn xóa nhóm quyền còn nhân viên đang được gán - tránh 1 staff đột nhiên mất hết quyền vì
  // nhóm của họ biến mất mà không ai biết.
  const staffCount = await Admin.countDocuments({ groupIds: group._id }); // số nhân viên đang thuộc nhóm
  if (staffCount > 0) {
    return res.status(400).json({ message: `Không thể xóa - còn ${staffCount} nhân viên đang thuộc nhóm này` });
  }
  await group.deleteOne();
  res.json({ message: 'Đã xóa nhóm quyền' });
});

module.exports = { getCatalog, getGroups, createGroup, updateGroup, deleteGroup };
