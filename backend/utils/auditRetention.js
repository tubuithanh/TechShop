const Setting = require('../models/Setting');
const AuditLog = require('../models/AuditLog');

// Số ngày lưu nhật ký thao tác (Cấu hình hệ thống -> Nhật ký thao tác):
// - 0: không ghi nhật ký
// - N > 0: chỉ giữ nhật ký của N ngày gần nhất, bản cũ hơn tự động bị xóa
// Đọc cấu hình có bộ nhớ đệm 30 giây để không phải truy vấn DB ở mỗi thao tác quản trị.
const DEFAULT_RETENTION_DAYS = 30;
const CACHE_MS = 30 * 1000;
let cache = null;

async function getRetentionDays() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.days;
  const setting = await Setting.findOne().select('auditLogRetentionDays').lean();
  const raw = setting?.auditLogRetentionDays;
  const days = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RETENTION_DAYS;
  cache = { days, at: Date.now() };
  return days;
}

function clearRetentionCache() {
  cache = null;
}

// Xóa nhật ký cũ hơn N ngày. Khi N = 0 (tắt ghi nhật ký) thì giữ nguyên nhật ký cũ đã có - admin muốn xóa
// thì dùng nút "Xóa tất cả" trên trang nhật ký. Trả về số bản ghi đã xóa.
async function purgeOldAuditLogs(now = new Date()) {
  const days = await getRetentionDays();
  if (days <= 0) return 0;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const { deletedCount } = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  return deletedCount || 0;
}

module.exports = { getRetentionDays, clearRetentionCache, purgeOldAuditLogs, DEFAULT_RETENTION_DAYS };
