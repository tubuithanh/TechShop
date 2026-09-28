const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tìm kiếm nhật ký:
// - q: từ khóa trong tên người thực hiện, hành động, đường dẫn, IP (không phân biệt hoa thường)
// - method: POST/PUT/PATCH/DELETE; role: vai trò người thực hiện; adminId
// - from/to: khoảng ngày (YYYY-MM-DD), tính trọn ngày "to"
const getAuditLogs = asyncHandler(async (req, res) => {
  const { adminId, q, method, role, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 30);
  const filter = {};
  if (typeof adminId === 'string' && mongoose.isValidObjectId(adminId)) filter.adminId = adminId;
  if (typeof method === 'string' && method) filter.method = method.toUpperCase();
  if (typeof role === 'string' && role) filter.adminRole = role;
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim().slice(0, 100)), 'i');
    filter.$or = [{ adminName: rx }, { action: rx }, { path: rx }, { ip: rx }];
  }
  const createdAt = {};
  if (typeof from === 'string' && !Number.isNaN(Date.parse(from))) createdAt.$gte = new Date(from);
  if (typeof to === 'string' && !Number.isNaN(Date.parse(to))) {
    createdAt.$lt = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000);
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter)
  ]);
  res.json({ data: logs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// Xóa toàn bộ nhật ký thao tác (chỉ admin). Bản thân thao tác xóa này sẽ được ghi lại thành 1 dòng nhật ký
// mới (nếu đang bật ghi nhật ký) để còn biết ai đã xóa và lúc nào.
const deleteAllAuditLogs = asyncHandler(async (req, res) => {
  const { deletedCount } = await AuditLog.deleteMany({});
  res.json({ message: `Đã xóa ${deletedCount} nhật ký thao tác`, deletedCount });
});

module.exports = { getAuditLogs, deleteAllAuditLogs };
