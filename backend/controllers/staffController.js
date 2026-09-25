const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/staff - danh sách tài khoản quản trị (admin + staff), chỉ admin xem được
const getStaffList = asyncHandler(async (req, res) => {
  const staff = await Admin.find().select('-password').populate('groupIds', 'name').sort({ createdAt: -1 });
  res.json({ data: staff });
});

const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role, groupIds } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email, mật khẩu' });
  }
  const existed = await Admin.findOne({ email: email.toLowerCase() });
  if (existed) return res.status(409).json({ message: 'Email đã được sử dụng' });

  if (groupIds?.length) {
    const validCount = await PermissionGroup.countDocuments({ _id: { $in: groupIds } });
    if (validCount !== new Set(groupIds.map(String)).size) {
      return res.status(400).json({ message: 'Một hoặc nhiều nhóm quyền không tồn tại' });
    }
  }

  const staff = await Admin.create({
    name,
    email: email.toLowerCase(),
    password,
    role: role === 'admin' ? 'admin' : 'staff',
    groupIds: role === 'admin' ? [] : groupIds || []
  });
  res.status(201).json({ data: staff.toSafeObject() });
});

const updateStaff = asyncHandler(async (req, res) => {
  const target = await Admin.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

  const { name, email, role, groupIds, isActive, newPassword } = req.body;
  const isSelf = target._id.toString() === req.account._id.toString();

  // Chặn tự khóa/tự hạ quyền chính mình - tránh admin duy nhất vô tình khóa/tự tước quyền admin
  // của bản thân, dẫn tới không còn ai đăng nhập được vào trang quản trị để sửa lại.
  if (isSelf && isActive === false) {
    return res.status(400).json({ message: 'Không thể tự khóa tài khoản của chính mình' });
  }
  if (isSelf && role === 'staff' && target.role === 'admin') {
    return res.status(400).json({ message: 'Không thể tự hạ quyền admin của chính mình' });
  }

  if (email !== undefined && email.toLowerCase() !== target.email) {
    const existed = await Admin.findOne({ email: email.toLowerCase(), _id: { $ne: target._id } });
    if (existed) return res.status(409).json({ message: 'Email đã được sử dụng' });
    target.email = email.toLowerCase();
  }
  if (name !== undefined) target.name = name;
  if (isActive !== undefined) target.isActive = isActive;
  if (role !== undefined) target.role = role === 'admin' ? 'admin' : 'staff';
  if (groupIds !== undefined) {
    if (groupIds.length) {
      const validCount = await PermissionGroup.countDocuments({ _id: { $in: groupIds } });
      if (validCount !== new Set(groupIds.map(String)).size) {
        return res.status(400).json({ message: 'Một hoặc nhiều nhóm quyền không tồn tại' });
      }
    }
    target.groupIds = target.role === 'admin' ? [] : groupIds;
  }
  if (newPassword) {
    if (newPassword.length < 6) return res.status(400).json({ message: 'Mật khẩu mới phải từ 6 ký tự' });
    target.password = newPassword;
  }

  await target.save();
  res.json({ data: target.toSafeObject() });
});

const deleteStaff = asyncHandler(async (req, res) => {
  const target = await Admin.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
  if (target._id.toString() === req.account._id.toString()) {
    return res.status(400).json({ message: 'Không thể tự xóa tài khoản của chính mình' });
  }
  await target.deleteOne();
  res.json({ message: 'Đã xóa tài khoản' });
});

module.exports = { getStaffList, createStaff, updateStaff, deleteStaff };
