const AuditLog = require('../models/AuditLog');

// Trước đây audit log chỉ ghi "đã có hành động xảy ra" (method + path + statusCode), không ghi
// GIÁ TRỊ đã gửi lên - không đủ để trả lời "admin đã đổi cái gì" khi xem lại sau này (VD: đổi
// quyền, bật/tắt bảo trì). Đính kèm request body đã lọc bỏ field nhạy cảm vào metadata.
// So khớp theo MẪU (không chỉ đúng tên tuyệt đối) để bắt được các biến thể như accessToken,
// zaloAccessToken, refreshToken, appSecret, otpCode... mà danh sách tên cố định trước đây bỏ sót.
const SENSITIVE_KEY_PATTERN = /password|secret|token|otp|apikey|api_key|pass$/i;
const MAX_SANITIZE_DEPTH = 4;

// Đệ quy vào các object/mảng lồng nhau - trước đây chỉ lọc field ở CẤP NGOÀI CÙNG của request body,
// nên dữ liệu nhạy cảm nằm trong object lồng nhau (VD: { auth: { password: "..." } }) vẫn bị ghi
// nguyên văn vào audit log.
function sanitizeValue(value, depth) {
  if (depth > MAX_SANITIZE_DEPTH || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, depth + 1));
  const clean = {};
  for (const [key, v] of Object.entries(value)) {
    clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[ẩn]' : sanitizeValue(v, depth + 1);
  }
  return clean;
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return sanitizeValue(body, 0);
}

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
  // Middleware này được gắn TRƯỚC khi các router (và middleware `protect` bên trong
  // từng router) chạy, nên req.account/req.accountRole chưa có giá trị tại thời điểm này.
  // Vì vậy phải hoãn việc đọc req.account đến sự kiện 'finish' (lúc đó `protect` đã chạy xong).
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  res.on('finish', () => {
    const isAdminActor = req.account && req.accountRole && req.accountRole !== 'customer';
    if (isAdminActor && res.statusCode < 400) {
      AuditLog.create({
        adminId: req.account._id,
        adminName: req.account.name,
        adminRole: req.accountRole,
        action: inferAction(req.method, req.originalUrl),
        method: req.method,
        path: req.originalUrl,
        targetId: req.params?.id || req.params?.productId || req.params?.orderId || null,
        ip: req.ip,
        metadata: { statusCode: res.statusCode, requestBody: sanitizeBody(req.body) }
      }).catch((err) => console.error('[AuditLog] Lỗi ghi log:', err.message));
    }
  });
  next();
}

module.exports = auditLogger;
