// Tuyến báo cáo: mỗi nhân viên có 1 "quản lý trực tiếp" (Admin.managerId).
// Quản lý xem được báo cáo của người báo cáo trực tiếp cho mình và (tùy chọn) cả cấp dưới của họ.
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

// Danh sách _id cấp dưới của managerId. recursive = cả các cấp bên dưới (tối đa 10 cấp)
async function subordinateIds(managerId, { recursive = true } = {}) {
  if (!managerId) return []; // không có id -> rỗng
  const id = new mongoose.Types.ObjectId(String(managerId));
  if (!recursive) return (await Admin.find({ managerId: id }).select('_id').lean()).map((a) => a._id); // chỉ cấp dưới trực tiếp
  const [row] = await Admin.aggregate([
    { $match: { _id: id } },
    { $graphLookup: { from: 'admins', startWith: '$_id', connectFromField: '_id', connectToField: 'managerId', as: 'subs', maxDepth: 9 } }, // duyệt cây báo cáo nhiều cấp (tối đa 10)
    { $project: { subs: '$subs._id' } }
  ]);
  return (row?.subs || []).filter((x) => String(x) !== String(id)); // bỏ chính người quản lý
}

// Kiểm tra gán managerId cho staffId hợp lệ: tồn tại, không phải chính mình, không tạo vòng (A quản lý B, B quản lý A)
async function validateManager(staffId, managerId) {
  if (managerId === null || managerId === '' || managerId === undefined) return { value: null }; // bỏ quản lý
  if (!mongoose.isValidObjectId(managerId)) return { error: 'Quản lý trực tiếp không hợp lệ' };
  if (staffId && String(staffId) === String(managerId)) return { error: 'Nhân viên không thể tự quản lý chính mình' };
  const manager = await Admin.findById(managerId).select('_id isActive').lean();
  if (!manager) return { error: 'Không tìm thấy quản lý trực tiếp' };
  if (manager.isActive === false) return { error: 'Quản lý trực tiếp đang bị khóa tài khoản' };
  if (staffId && (await subordinateIds(staffId)).some((x) => String(x) === String(managerId))) { // chọn cấp dưới làm quản lý -> vòng lặp
    return { error: 'Không thể chọn cấp dưới của nhân viên này làm quản lý (tạo vòng báo cáo)' };
  }
  return { value: manager._id };
}

module.exports = { subordinateIds, validateManager };
