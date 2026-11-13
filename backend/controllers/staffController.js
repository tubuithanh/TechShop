const Admin = require('../models/Admin');
// Email nhân viên không được trùng email khách hàng: đăng nhập tìm bảng khách hàng trước, nên tài khoản nhân
// viên trùng email có thể bị đăng nhập nhầm thành khách hàng
const User = require('../models/User');
const PermissionGroup = require('../models/PermissionGroup');
const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');
const { disconnectAccount } = require('../utils/socketAuth');
const { recordStoreChanges } = require('./staffWorkController');
const { validateManager } = require('../utils/reportingLine');

// Danh sách chi nhánh quản lý thêm: id hợp lệ, không trùng, tồn tại, không trùng chi nhánh chính
async function parseManagedStores(list, homeStoreId) {
  if (list === undefined) return { value: undefined };
  if (!Array.isArray(list) || list.length > 50) return { error: 'Danh sách chi nhánh quản lý không hợp lệ' };
  const ids = [...new Set(list.map((x) => String(x?._id ?? x)))].filter((x) => x !== String(homeStoreId || ''));
  if (ids.some((x) => !require('mongoose').isValidObjectId(x))) return { error: 'Danh sách chi nhánh quản lý không hợp lệ' };
  if ((await Store.countDocuments({ _id: { $in: ids }, isActive: { $ne: false } })) !== ids.length) return { error: 'Một hoặc nhiều chi nhánh quản lý không tồn tại hoặc đã ngưng hoạt động' };
  return { value: ids };
}

// @route GET /api/staff - danh sách tài khoản quản trị (admin + staff), chỉ admin xem được
const getStaffList = asyncHandler(async (req, res) => {
  const staff = await Admin.find()
    .select('-password')
    .populate('groupIds', 'name')
    .populate('storeId', 'name city')
    .populate('managedStoreIds', 'name city')
    .populate('managerId', 'name title')
    .sort({ createdAt: -1 });
  res.json({ data: staff });
});

// Chi nhánh chính phải tồn tại và đang hoạt động
async function assertStoreExists(storeId) {
  if (!storeId) return true;
  return Boolean(await Store.exists({ _id: storeId, isActive: { $ne: false } }));
}

const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role, groupIds, storeId, managedStoreIds, title, managerId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email, mật khẩu' });
  }
  const existed = (await Admin.findOne({ email: email.toLowerCase() })) || (await User.exists({ email: email.toLowerCase() }));
  if (existed) return res.status(409).json({ message: 'Email đã được sử dụng (bởi nhân viên hoặc khách hàng)' });

  if (groupIds?.length) {
    const validCount = await PermissionGroup.countDocuments({ _id: { $in: groupIds } });
    if (validCount !== new Set(groupIds.map(String)).size) {
      return res.status(400).json({ message: 'Một hoặc nhiều nhóm quyền không tồn tại' });
    }
  }
  if (storeId && !(await assertStoreExists(storeId))) {
    return res.status(400).json({ message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động' });
  }

  const managed = role === 'admin' ? { value: [] } : await parseManagedStores(managedStoreIds ?? [], storeId);
  if (managed.error) return res.status(400).json({ message: managed.error });
  const mgr = await validateManager(null, managerId);
  if (mgr.error) return res.status(400).json({ message: mgr.error });

  const staff = await Admin.create({
    managerId: mgr.value,
    name,
    email: email.toLowerCase(),
    password,
    role: role === 'admin' ? 'admin' : 'staff',
    groupIds: role === 'admin' ? [] : groupIds || [],
    // storeId chỉ có ý nghĩa với staff - admin không bị giới hạn theo chi nhánh nên luôn để trống.
    storeId: role === 'admin' ? null : storeId || null,
    managedStoreIds: managed.value,
    title: String(title || '').trim().slice(0, 80)
  });
  await recordStoreChanges(staff, { storeId: null, managedStoreIds: [] }, req.account._id);
  res.status(201).json({ data: staff.toSafeObject() });
});

const updateStaff = asyncHandler(async (req, res) => {
  const target = await Admin.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

  const { name, email, role, groupIds, storeId, isActive, newPassword, managedStoreIds, title, managerId } = req.body;
  const before = { storeId: target.storeId, managedStoreIds: [...(target.managedStoreIds || [])] };
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
    const existed =
      (await Admin.findOne({ email: email.toLowerCase(), _id: { $ne: target._id } })) || (await User.exists({ email: email.toLowerCase() }));
    if (existed) return res.status(409).json({ message: 'Email đã được sử dụng (bởi nhân viên hoặc khách hàng)' });
    target.email = email.toLowerCase();
  }
  if (name !== undefined) target.name = name;
  if (isActive !== undefined) target.isActive = isActive;
  if (role !== undefined) {
    target.role = role === 'admin' ? 'admin' : 'staff';
    // Luôn dọn sạch groupIds ngay khi lên admin - dù request KHÔNG gửi kèm groupIds. Nếu không, tài
    // khoản này vẫn giữ nguyên nhóm quyền cũ (dữ liệu "treo", vô hại lúc đang là admin vì admin luôn
    // toàn quyền bất kể groupIds), nhưng nếu sau này bị hạ lại xuống staff mà không ai chủ động chọn
    // lại nhóm, họ sẽ ÂM THẦM kế thừa đúng nhóm quyền cũ trước khi được thăng lên admin.
    // Cùng lý do với groupIds - dọn luôn storeId (chi nhánh) khi lên admin, tránh dữ liệu "treo".
    if (target.role === 'admin') { target.storeId = null; target.managedStoreIds = []; }
  }
  if (groupIds !== undefined && target.role === 'staff') {
    if (groupIds.length) {
      const validCount = await PermissionGroup.countDocuments({ _id: { $in: groupIds } });
      if (validCount !== new Set(groupIds.map(String)).size) {
        return res.status(400).json({ message: 'Một hoặc nhiều nhóm quyền không tồn tại' });
      }
    }
    target.groupIds = groupIds;
  }
  if (storeId !== undefined && target.role === 'staff') {
    if (storeId && !(await assertStoreExists(storeId))) {
      return res.status(400).json({ message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động' });
    }
    target.storeId = storeId || null;
  }
  if (title !== undefined) target.title = String(title || '').trim().slice(0, 80);
  if (managerId !== undefined) {
    const mgr = await validateManager(target._id, managerId);
    if (mgr.error) return res.status(400).json({ message: mgr.error });
    target.managerId = mgr.value;
  }
  if (managedStoreIds !== undefined && target.role === 'staff') {
    const managed = await parseManagedStores(managedStoreIds, target.storeId);
    if (managed.error) return res.status(400).json({ message: managed.error });
    target.managedStoreIds = managed.value;
  }
  if (newPassword) {
    if (newPassword.length < 6) return res.status(400).json({ message: 'Mật khẩu mới phải từ 6 ký tự' });
    target.password = newPassword;
    target.tokenVersion = (target.tokenVersion || 0) + 1; // admin đặt lại mật khẩu -> nhân viên phải đăng nhập lại
  }

  // Chi nhánh chính không đồng thời nằm trong danh sách chi nhánh làm việc khác
  if (target.storeId) target.managedStoreIds = (target.managedStoreIds || []).filter((m) => String(m) !== String(target.storeId));
  await target.save();
  await recordStoreChanges(target, before, req.account._id); // ghi quá trình làm việc khi đổi chi nhánh
  // Khóa / đổi vai trò / nhóm quyền / mật khẩu: ngắt kết nối real-time đang mở để quyền mới có hiệu lực ngay
  disconnectAccount(req, target._id);
  res.json({ data: target.toSafeObject() });
});

const deleteStaff = asyncHandler(async (req, res) => {
  const target = await Admin.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
  if (target._id.toString() === req.account._id.toString()) {
    return res.status(400).json({ message: 'Không thể tự xóa tài khoản của chính mình' });
  }
  // Cấp dưới của người bị xóa chuyển sang báo cáo cho quản lý của người đó (không bị mất tuyến báo cáo)
  await Admin.updateMany({ managerId: target._id }, { $set: { managerId: target.managerId || null } });
  await target.deleteOne();
  disconnectAccount(req, target._id);
  res.json({ message: 'Đã xóa tài khoản' });
});

module.exports = { getStaffList, createStaff, updateStaff, deleteStaff };
