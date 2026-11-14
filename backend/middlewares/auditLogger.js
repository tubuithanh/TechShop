const AuditLog = require('../models/AuditLog'); // collection lưu nhật ký thao tác
const { getRetentionDays } = require('../utils/auditRetention'); // số ngày lưu nhật ký (0 = tắt ghi)

// Trước đây audit log chỉ ghi "đã có hành động xảy ra" (method + path + statusCode), không ghi
// GIÁ TRỊ đã gửi lên - không đủ để trả lời "admin đã đổi cái gì" khi xem lại sau này (VD: đổi
// quyền, bật/tắt bảo trì). Đính kèm request body đã lọc bỏ field nhạy cảm vào metadata.
// So khớp theo MẪU (không chỉ đúng tên tuyệt đối) để bắt được các biến thể như accessToken,
// zaloAccessToken, refreshToken, appSecret, otpCode... mà danh sách tên cố định trước đây bỏ sót.
const SENSITIVE_KEY_PATTERN = /password|secret|token|otp|apikey|api_key|pass$/i; // tên khóa chứa các từ này -> che
const MAX_SANITIZE_DEPTH = 4; // chỉ duyệt tối đa 4 cấp lồng nhau

// Đệ quy vào các object/mảng lồng nhau - trước đây chỉ lọc field ở CẤP NGOÀI CÙNG của request body,
// nên dữ liệu nhạy cảm nằm trong object lồng nhau (VD: { auth: { password: "..." } }) vẫn bị ghi
// nguyên văn vào audit log.
function sanitizeValue(value, depth) {
  if (value == null || typeof value !== 'object') return value; // giá trị đơn: giữ nguyên
  // SỬA LỖI: trước đây quá 4 cấp thì trả NGUYÊN object -> mật khẩu lồng sâu hơn vẫn bị ghi vào nhật ký.
  // Nay thay cả nhánh quá sâu bằng chữ "[lồng quá sâu]" (an toàn hơn là ghi thiếu chi tiết).
  if (depth > MAX_SANITIZE_DEPTH) return '[lồng quá sâu]';
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, depth + 1)); // mảng: làm sạch từng phần tử
  const clean = {}; // tạo object MỚI (không sửa req.body gốc vì controller còn dùng)
  for (const [key, v] of Object.entries(value)) {
    clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[ẩn]' : sanitizeValue(v, depth + 1); // khóa nhạy cảm -> "[ẩn]"
  }
  return clean;
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined; // body rỗng / lạ -> không ghi
  return sanitizeValue(body, 0);
}

// Đặt tên hành động dễ đọc từ method + đường dẫn
function inferAction(method, path) {
  const cleanPath = path.split('?')[0]; // bỏ phần tham số sau "?"
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
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { // chỉ ghi thao tác THAY ĐỔI dữ liệu, bỏ qua GET
    return next();
  }

  res.on('finish', () => { // chạy sau khi đã gửi xong phản hồi
    const isAdminActor = req.account && req.accountRole && req.accountRole !== 'customer'; // là admin / nhân viên
    if (!isAdminActor || res.statusCode >= 400) return; // khách hàng hoặc thao tác thất bại -> không ghi
    // Số ngày lưu nhật ký = 0 -> tắt ghi nhật ký
    getRetentionDays()
      .then((days) => days > 0 && AuditLog.create({ // còn bật -> tạo bản ghi
        adminId: req.account._id, // ai làm
        adminName: req.account.name,
        adminRole: req.accountRole,
        action: inferAction(req.method, req.originalUrl), // làm gì
        method: req.method,
        path: req.originalUrl,
        targetId: req.params?.id || req.params?.productId || req.params?.orderId || null, // trên bản ghi nào
        ip: req.ip, // từ địa chỉ IP nào
        metadata: { statusCode: res.statusCode, requestBody: sanitizeBody(req.body) } // dữ liệu đã gửi (đã che)
      }))
      .catch((err) => console.error('[AuditLog] Lỗi ghi log:', err.message)); // lỗi ghi log không ảnh hưởng người dùng
  });
  next(); // cho request đi tiếp ngay
}

module.exports = auditLogger;
