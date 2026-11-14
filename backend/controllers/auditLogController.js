const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { dateRange } = require('../utils/dateRange');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tìm kiếm nhật ký:
// - q: từ khóa trong tên người thực hiện, hành động, đường dẫn, IP (không phân biệt hoa thường)
// - method: POST/PUT/PATCH/DELETE; role: vai trò người thực hiện; adminId
// - from/to: khoảng ngày (YYYY-MM-DD), tính trọn ngày "to"
const getAuditLogs = asyncHandler(async (req, res) => {
  const { adminId, q, method, role, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1); // trang >= 1
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30)); // 1..100, mặc định 30
  const filter = {};
  if (typeof adminId === 'string' && mongoose.isValidObjectId(adminId)) filter.adminId = adminId; // lọc theo người thực hiện
  if (typeof method === 'string' && method) filter.method = method.toUpperCase(); // lọc theo loại thao tác
  if (typeof role === 'string' && role) filter.adminRole = role; // lọc theo vai trò
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim().slice(0, 100)), 'i'); // từ khóa tối đa 100 ký tự
    filter.$or = [{ adminName: rx }, { action: rx }, { path: rx }, { ip: rx }]; // tìm trong tên / hành động / đường dẫn / IP
  }
  const createdAt = dateRange(from, to); // ngày theo giờ Việt Nam
  if (createdAt) filter.createdAt = createdAt;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), // mới nhất trước
    AuditLog.countDocuments(filter)
  ]);
  res.json({ data: logs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// Xóa toàn bộ nhật ký thao tác (chỉ admin). Bản thân thao tác xóa này sẽ được ghi lại thành 1 dòng nhật ký
// mới (nếu đang bật ghi nhật ký) để còn biết ai đã xóa và lúc nào.
const deleteAllAuditLogs = asyncHandler(async (req, res) => {
  const { deletedCount } = await AuditLog.deleteMany({}); // xóa hết
  res.json({ message: `Đã xóa ${deletedCount} nhật ký thao tác`, deletedCount });
});

module.exports = { getAuditLogs, deleteAllAuditLogs };
