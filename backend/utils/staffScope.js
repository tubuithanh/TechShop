// Phạm vi chi nhánh của 1 nhân viên tại thời điểm hiện tại:
//   working  = chi nhánh đang điều chuyển tạm thời (nếu đang trong thời gian điều chuyển) hoặc chi nhánh chính
//   allowed  = working + các chi nhánh quản lý thêm (managedStoreIds)
//   current  = chi nhánh đang chọn để thao tác (header X-Store-Id nếu thuộc allowed, nếu không thì working)
// Nhân viên không gắn chi nhánh nào (allowed rỗng) = không giới hạn, giữ đúng hành vi cũ.
const StaffAssignment = require('../models/StaffAssignment'); // lịch điều chuyển / phân công nhân viên

// Tìm lệnh điều chuyển ĐANG có hiệu lực của nhân viên (nếu có)
async function activeTransfer(staffId, now = new Date()) {
  return StaffAssignment.findOne({
    staffId, // của đúng nhân viên này
    kind: 'transfer', // loại "điều chuyển"
    cancelled: { $ne: true }, // chưa bị hủy
    startDate: { $lte: now }, // đã bắt đầu
    $or: [{ endDate: null }, { endDate: { $gt: now } }] // chưa kết thúc (hoặc không có ngày kết thúc)
  }).sort({ startDate: -1 }).populate('storeId', 'name city').lean(); // nhiều lệnh chồng nhau -> lấy lệnh mới nhất
}

const NO_STORE = '000000000000000000000000'; // id "không tồn tại" - dùng để khóa nhân viên không thấy dữ liệu nào
const idOf = (x) => (x ? String(x._id || x) : null); // lấy id dạng chuỗi từ ObjectId hoặc document đã populate

async function computeStoreScope(account, requestedStoreId) {
  const transfer = await activeTransfer(account._id); // điều chuyển đang hiệu lực
  const working = transfer?.storeId || account.storeId || null; // ưu tiên chi nhánh điều chuyển, sau đó chi nhánh chính
  // Chi nhánh quản lý thêm đã ngưng hoạt động -> không còn trong danh sách chọn (chi nhánh chính / điều chuyển
  // không thể là chi nhánh đã ngưng vì việc ngưng hoạt động bị chặn khi còn nhân viên)
  const managed = (account.managedStoreIds || []).filter((m) => m && m.isActive !== false);
  const allowedMap = new Map(); // Map giữ thứ tự chèn + không trùng: id -> thông tin chi nhánh
  if (working) allowedMap.set(idOf(working), working); // chi nhánh làm việc luôn đứng đầu
  for (const m of managed) if (!allowedMap.has(idOf(m))) allowedMap.set(idOf(m), m); // thêm chi nhánh quản lý (bỏ trùng)
  // Nhân viên CÓ được gán chi nhánh nhưng mọi chi nhánh đều đã ngưng -> khóa vào 1 id không tồn tại. Không được để
  // danh sách rỗng vì rỗng nghĩa là "không giới hạn" (thấy dữ liệu toàn hệ thống).
  if (!allowedMap.size && ((account.managedStoreIds || []).length || account.storeId || transfer)) {
    return { allowed: [NO_STORE], current: NO_STORE, currentStore: null, stores: [], transfer: null };
  }
  const allowed = [...allowedMap.keys()]; // danh sách id được phép
  let current = null; // chi nhánh đang thao tác
  if (allowed.length) {
    // Nhân viên chọn chi nhánh qua header X-Store-Id: chỉ chấp nhận nếu nằm trong danh sách được phép (chống giả header)
    current = requestedStoreId && allowedMap.has(String(requestedStoreId)) ? String(requestedStoreId) : allowed[0];
  }
  return {
    allowed, // [] = không giới hạn
    current, // null = không giới hạn
    currentStore: current ? allowedMap.get(current) : null, // thông tin chi nhánh đang chọn (hiển thị)
    stores: [...allowedMap.values()], // danh sách cho ô chọn chi nhánh
    transfer: transfer ? { _id: transfer._id, storeId: transfer.storeId, startDate: transfer.startDate, endDate: transfer.endDate, reason: transfer.reason } : null // thông tin điều chuyển (nếu có)
  };
}

module.exports = { computeStoreScope, activeTransfer };
