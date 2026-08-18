const AuditLog = require('../models/AuditLog');

function inferAction(method, path) {
  const cleanPath = path.split('?')[0];
  if (method === 'POST') return `TAO_MOI [${cleanPath}]`;
  if (method === 'PUT' || method === 'PATCH') return `CAP_NHAT [${cleanPath}]`;
  if (method === 'DELETE') return `XOA [${cleanPath}]`;
  return `${method} [${cleanPath}]`;
}

/**
 * Middleware ghi nhật ký thao tác quản trị (audit log).
 * Chỉ ghi log khi người thực hiện là Admin/Staff (req.accountRole khác 'customer'),
 * vì audit log chỉ áp dụng cho hành vi quản trị hệ thống theo thiết kế collection "admins".
 */
function auditLogger(req, res, next) {
  const isAdminActor = req.account && req.accountRole && req.accountRole !== 'customer';
  const shouldLog = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && isAdminActor;

  if (shouldLog) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        AuditLog.create({
          adminId: req.account._id,
          adminName: req.account.name,
          adminRole: req.accountRole,
          action: inferAction(req.method, req.originalUrl),
          method: req.method,
          path: req.originalUrl,
          targetId: req.params?.id || req.params?.productId || req.params?.orderId || null,
          ip: req.ip,
          metadata: { statusCode: res.statusCode }
        }).catch((err) => console.error('[AuditLog] Lỗi ghi log:', err.message));
      }
    });
  }
  next();
}

module.exports = auditLogger;
