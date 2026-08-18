const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');

const getAuditLogs = asyncHandler(async (req, res) => {
  const { adminId, page = 1, limit = 30 } = req.query;
  const filter = {};
  if (adminId) filter.adminId = adminId;

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await AuditLog.countDocuments(filter);
  res.json({ data: logs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

module.exports = { getAuditLogs };
