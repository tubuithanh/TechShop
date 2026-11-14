const Admin = require('../models/Admin'); // tài khoản admin / nhân viên
// Email nhân viên không được trùng email khách hàng: đăng nhập tìm bảng khách hàng trước, nên tài khoản nhân
// viên trùng email có thể bị đăng nhập nhầm thành khách hàng
const User = require('../models/User');
const PermissionGroup = require('../models/PermissionGroup'); // nhóm quyền
const Store = require('../models/Store'); // chi nhánh
const asyncHandler = require('../utils/asyncHandler');
const { disconnectAccount } = require('../utils/socketAuth'); // ngắt kết nối real-time khi đổi quyền
const { recordStoreChanges } = require('./staffWorkController'); // ghi quá trình công tác khi đổi chi nhánh
const { validateManager } = require('../utils/reportingLine'); // kiểm tra quản lý trực tiếp (không vòng lặp)

// Danh sách chi nhánh quản lý thêm: id hợp lệ, không trùng, tồn tại, không trùng chi nhánh chính
async function parseManagedStores(list, homeStoreId) {
  if (list === undefined) return { value: undefined }; // không gửi -> giữ nguyên
  if (!Array.isArray(list) || list.length > 50) return { error: 'Danh sách chi nhánh quản lý không hợp lệ' }; // tối đa 50 chi nhánh
  const ids = [...new Set(list.map((x) => String(x?._id ?? x)))].filter((x) => x !== String(homeStoreId || '')); // bỏ trùng, bỏ chi nhánh chính
  if (ids.some((x) => !require('mongoose').isValidObjectId(x))) return { error: 'Danh sách chi nhánh quản lý không hợp lệ' };
  if ((await Store.countDocuments({ _id: { $in: ids }, isActive: { $ne: false } })) !== ids.length) return { error: 'Một hoặc nhiều chi nhánh quản lý không tồn tại hoặc đã ngưng hoạt động' }; // mọi chi nhánh phải tồn tại + đang hoạt động
  return { value: ids };
}

// SỬA LỖI: kiểm tra kiểu dữ liệu đầu vào (trả câu lỗi hoặc null). password = mật khẩu khi tạo / mật khẩu mới khi sửa.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function staffInputError({ name, email, groupIds, isActive, password }) {
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 100)) return 'Họ tên từ 1 đến 100 ký tự'; // họ tên 1-100 ký tự
  if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email.trim()))) return 'Email không hợp lệ'; // email đúng dạng
  if (groupIds !== undefined && (!Array.isArray(groupIds) || groupIds.length > 50 || groupIds.some((g) => !require('mongoose').isValidObjectId(String(g))))) return 'Danh sách nhóm quyền không hợp lệ'; // mảng id hợp lệ, tối đa 50
  if (isActive !== undefined && typeof isActive !== 'boolean') return 'Trạng thái không hợp lệ'; // true / false
  if (password !== undefined && password !== null && password !== '' && (typeof password !== 'string' || password.length < 6 || password.length > 128)) return 'Mật khẩu phải từ 6 đến 128 ký tự'; // mật khẩu 6-128 ký tự
  return null;
}

// @route GET /api/staff - danh sách tài khoản quản trị (admin + staff), chỉ admin xem được
const getStaffList = asyncHandler(async (req, res) => {
  const staff = await Admin.find() // mọi tài khoản quản trị
    .select('-password') // không trả mật khẩu băm
    .populate('groupIds', 'name')
    .populate('storeId', 'name city')
    .populate('managedStoreIds', 'name city')
    .populate('managerId', 'name title') // quản lý trực tiếp
    .sort({ createdAt: -1 });
  res.json({ data: staff });
});

// Chi nhánh chính phải tồn tại và đang hoạt động
async function assertStoreExists(storeId) {
  if (!storeId) return true; // không gán chi nhánh = hợp lệ
  return Boolean(await Store.exists({ _id: storeId, isActive: { $ne: false } }));
}

const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role, groupIds, storeId, managedStoreIds, title, managerId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email, mật khẩu' });
  }
  // SỬA LỖI: trước đây không kiểm tra kiểu / mật khẩu -> email dạng object gây lỗi 500, tạo được mật khẩu 1 ký tự
  const inputError = staffInputError({ name, email, groupIds, password });
  if (inputError) return res.status(400).json({ message: inputError });
  const existed = (await Admin.findOne({ email: email.toLowerCase() })) || (await User.exists({ email: email.toLowerCase() })); // email không trùng nhân viên lẫn khách
  if (existed) return res.status(409).json({ message: 'Email đã được sử dụng (bởi nhân viên hoặc khách hàng)' });

  if (groupIds?.length) { // nhóm quyền phải tồn tại
    const validCount = await PermissionGroup.countDocuments({ _id: { $in: groupIds } });
    if (validCount !== new Set(groupIds.map(String)).size) {
      return res.status(400).json({ message: 'Một hoặc nhiều nhóm quyền không tồn tại' });
    }
  }
  if (storeId && !(await assertStoreExists(storeId))) {
    return res.status(400).json({ message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động' });
  }

  const managed = role === 'admin' ? { value: [] } : await parseManagedStores(managedStoreIds ?? [], storeId); // admin không cần chi nhánh quản lý thêm
  if (managed.error) return res.status(400).json({ message: managed.error });
  const mgr = await validateManager(null, managerId); // quản lý trực tiếp hợp lệ
  if (mgr.error) return res.status(400).json({ message: mgr.error });

  const staff = await Admin.create({
    managerId: mgr.value,
    name,
    email: email.toLowerCase(),
    password,
    role: role === 'admin' ? 'admin' : 'staff', // chỉ nhận 2 giá trị
    groupIds: role === 'admin' ? [] : groupIds || [], // admin toàn quyền, không cần nhóm
    // storeId chỉ có ý nghĩa với staff - admin không bị giới hạn theo chi nhánh nên luôn để trống.
    storeId: role === 'admin' ? null : storeId || null,
    managedStoreIds: managed.value,
    title: String(title || '').trim().slice(0, 80) // chức danh tối đa 80 ký tự
  });
  await recordStoreChanges(staff, { storeId: null, managedStoreIds: [] }, req.account._id); // ghi lần gán chi nhánh đầu tiên
  res.status(201).json({ data: staff.toSafeObject() }); // trả về không kèm mật khẩu
});

const updateStaff = asyncHandler(async (req, res) => {
  const target = await Admin.findById(req.params.id); // tài khoản cần sửa
  if (!target) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

  const { name, email, role, groupIds, storeId, isActive, newPassword, managedStoreIds, title, managerId } = req.body;
  const inputError = staffInputError({ name, email, groupIds, isActive, password: newPassword }); // kiểm tra kiểu dữ liệu
  if (inputError) return res.status(400).json({ message: inputError });
  const before = { storeId: target.storeId, managedStoreIds: [...(target.managedStoreIds || [])] }; // chụp chi nhánh trước khi sửa
  const isSelf = target._id.toString() === req.account._id.toString(); // đang tự sửa chính mình?

  // Chặn tự khóa/tự hạ quyền chính mình - tránh admin duy nhất vô tình khóa/tự tước quyền admin
  // của bản thân, dẫn tới không còn ai đăng nhập được vào trang quản trị để sửa lại.
  if (isSelf && isActive === false) {
    return res.status(400).json({ message: 'Không thể tự khóa tài khoản của chính mình' });
  }
  if (isSelf && role === 'staff' && target.role === 'admin') {
    return res.status(400).json({ message: 'Không thể tự hạ quyền admin của chính mình' });
  }

  if (email !== undefined && email.toLowerCase() !== target.email) { // đổi email -> kiểm tra trùng
    const existed =
      (await Admin.findOne({ email: email.toLowerCase(), _id: { $ne: target._id } })) || (await User.exists({ email: email.toLowerCase() }));
    if (existed) return res.status(409).json({ message: 'Email đã được sử dụng (bởi nhân viên hoặc khách hàng)' });
    target.email = email.toLowerCase();
  }
  if (name !== undefined) target.name = name;
  if (isActive !== undefined) target.isActive = isActive; // khóa / mở khóa
  if (role !== undefined) {
    target.role = role === 'admin' ? 'admin' : 'staff';
    // Luôn dọn sạch groupIds ngay khi lên admin - dù request KHÔNG gửi kèm groupIds. Nếu không, tài
    // khoản này vẫn giữ nguyên nhóm quyền cũ (dữ liệu "treo", vô hại lúc đang là admin vì admin luôn
    // toàn quyền bất kể groupIds), nhưng nếu sau này bị hạ lại xuống staff mà không ai chủ động chọn
    // lại nhóm, họ sẽ ÂM THẦM kế thừa đúng nhóm quyền cũ trước khi được thăng lên admin.
    // Cùng lý do với groupIds - dọn luôn storeId (chi nhánh) khi lên admin, tránh dữ liệu "treo".
    if (target.role === 'admin') { target.storeId = null; target.managedStoreIds = []; }
  }
  if (groupIds !== undefined && target.role === 'staff') { // chỉ staff mới có nhóm quyền
    if (groupIds.length) {
      const validCount = await PermissionGroup.countDocuments({ _id: { $in: groupIds } });
      if (validCount !== new Set(groupIds.map(String)).size) {
        return res.status(400).json({ message: 'Một hoặc nhiều nhóm quyền không tồn tại' });
      }
    }
    target.groupIds = groupIds;
  }
  if (storeId !== undefined && target.role === 'staff') { // đổi chi nhánh chính
    if (storeId && !(await assertStoreExists(storeId))) {
      return res.status(400).json({ message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động' });
    }
    target.storeId = storeId || null;
  }
  if (title !== undefined) target.title = String(title || '').trim().slice(0, 80);
  if (managerId !== undefined) { // đổi quản lý trực tiếp
    const mgr = await validateManager(target._id, managerId); // chặn tự làm quản lý của mình / vòng lặp
    if (mgr.error) return res.status(400).json({ message: mgr.error });
    target.managerId = mgr.value;
  }
  if (managedStoreIds !== undefined && target.role === 'staff') { // đổi chi nhánh quản lý thêm
    const managed = await parseManagedStores(managedStoreIds, target.storeId);
    if (managed.error) return res.status(400).json({ message: managed.error });
    target.managedStoreIds = managed.value;
  }
  if (newPassword) { // admin đặt lại mật khẩu
    if (newPassword.length < 6) return res.status(400).json({ message: 'Mật khẩu mới phải từ 6 ký tự' });
    target.password = newPassword; // băm trong hook pre(save)
    target.tokenVersion = (target.tokenVersion || 0) + 1; // admin đặt lại mật khẩu -> nhân viên phải đăng nhập lại
  }

  // Chi nhánh chính không đồng thời nằm trong danh sách chi nhánh làm việc khác
  if (target.storeId) target.managedStoreIds = (target.managedStoreIds || []).filter((m) => String(m) !== String(target.storeId));
  await target.save(); // lưu
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
  await Admin.updateMany({ managerId: target._id }, { $set: { managerId: target.managerId || null } }); // cấp dưới chuyển lên quản lý cấp trên
  await target.deleteOne(); // xóa hẳn
  disconnectAccount(req, target._id);
  res.json({ message: 'Đã xóa tài khoản' });
});

module.exports = { getStaffList, createStaff, updateStaff, deleteStaff };
