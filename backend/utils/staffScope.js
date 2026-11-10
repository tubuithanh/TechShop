// Phạm vi chi nhánh của 1 nhân viên tại thời điểm hiện tại:
//   working  = chi nhánh đang điều chuyển tạm thời (nếu đang trong thời gian điều chuyển) hoặc chi nhánh chính
//   allowed  = working + các chi nhánh quản lý thêm (managedStoreIds)
//   current  = chi nhánh đang chọn để thao tác (header X-Store-Id nếu thuộc allowed, nếu không thì working)
// Nhân viên không gắn chi nhánh nào (allowed rỗng) = không giới hạn, giữ đúng hành vi cũ.
const StaffAssignment = require('../models/StaffAssignment');

async function activeTransfer(staffId, now = new Date()) {
  return StaffAssignment.findOne({
    staffId,
    kind: 'transfer',
    cancelled: { $ne: true },
    startDate: { $lte: now },
    $or: [{ endDate: null }, { endDate: { $gt: now } }]
  }).sort({ startDate: -1 }).populate('storeId', 'name city').lean();
}

const NO_STORE = '000000000000000000000000';
const idOf = (x) => (x ? String(x._id || x) : null);

async function computeStoreScope(account, requestedStoreId) {
  const transfer = await activeTransfer(account._id);
  const working = transfer?.storeId || account.storeId || null;
  // Chi nhánh quản lý thêm đã ngưng hoạt động -> không còn trong danh sách chọn (chi nhánh chính / điều chuyển
  // không thể là chi nhánh đã ngưng vì việc ngưng hoạt động bị chặn khi còn nhân viên)
  const managed = (account.managedStoreIds || []).filter((m) => m && m.isActive !== false);
  const allowedMap = new Map();
  if (working) allowedMap.set(idOf(working), working);
  for (const m of managed) if (!allowedMap.has(idOf(m))) allowedMap.set(idOf(m), m);
  // Nhân viên CÓ được gán chi nhánh nhưng mọi chi nhánh đều đã ngưng -> khóa vào 1 id không tồn tại. Không được để
  // danh sách rỗng vì rỗng nghĩa là "không giới hạn" (thấy dữ liệu toàn hệ thống).
  if (!allowedMap.size && ((account.managedStoreIds || []).length || account.storeId || transfer)) {
    return { allowed: [NO_STORE], current: NO_STORE, currentStore: null, stores: [], transfer: null };
  }
  const allowed = [...allowedMap.keys()];
  let current = null;
  if (allowed.length) {
    current = requestedStoreId && allowedMap.has(String(requestedStoreId)) ? String(requestedStoreId) : allowed[0];
  }
  return {
    allowed,
    current,
    currentStore: current ? allowedMap.get(current) : null,
    stores: [...allowedMap.values()],
    transfer: transfer ? { _id: transfer._id, storeId: transfer.storeId, startDate: transfer.startDate, endDate: transfer.endDate, reason: transfer.reason } : null
  };
}

module.exports = { computeStoreScope, activeTransfer };
