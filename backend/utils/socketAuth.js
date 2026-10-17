const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

// Xác định tài khoản của 1 kết nối Socket.IO từ access token - kiểm tra GIỐNG middleware protect:
// tài khoản còn hoạt động, tokenVersion khớp (đổi mật khẩu thì token cũ mất hiệu lực), vai trò lấy từ
// cơ sở dữ liệu chứ không tin giá trị cũ trong token. Trước đây chỉ kiểm chữ ký, nên nhân viên đã bị khóa
// hoặc bị hạ quyền vẫn vào được phòng hỗ trợ cho tới khi token hết hạn.
// Trả về { userId, role, canSupport } hoặc null (kết nối ẩn danh: không vào phòng riêng nào).
async function resolveSocketAccount(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    return null;
  }
  const isCustomer = decoded.role === 'customer';
  const account = isCustomer
    ? await User.findById(decoded.id)
    : await Admin.findById(decoded.id).populate('groupIds', 'permissions');
  if (!account || !account.isActive) return null;
  if ((decoded.tv || 0) !== (account.tokenVersion || 0)) return null;
  const role = isCustomer ? 'customer' : account.role;
  // Chat hỗ trợ khách: admin, hoặc nhân viên thuộc nhóm có quyền chat.support (giống API /api/chat)
  const canSupport = role === 'admin' || (role === 'staff' && (account.groupIds || []).some((g) => g.permissions?.includes('chat.support')));
  return { userId: String(account._id), role, canSupport };
}

// Nội dung tin nhắn chat hợp lệ: chuỗi, bỏ khoảng trắng thừa, không rỗng, tối đa 2000 ký tự
const MAX_CHAT_LENGTH = 2000;
function cleanChatContent(content) {
  if (typeof content !== 'string') return null;
  const text = content.trim();
  return text && text.length <= MAX_CHAT_LENGTH ? text : null;
}

// Ngắt mọi kết nối Socket.IO đang mở của 1 tài khoản - gọi khi khóa tài khoản hoặc đổi / đặt lại mật khẩu,
// để quyền cũ không còn hiệu lực trên kết nối đang mở (trước đây kéo dài tới khi người dùng tải lại trang).
// Mỗi tài khoản luôn ở phòng user_<id> nên chỉ cần ngắt phòng đó. Trình duyệt sẽ kết nối lại bằng token
// hiện tại và chỉ vào lại phòng nếu token đó còn hợp lệ.
function disconnectAccount(req, accountId) {
  const io = req.app?.get('io');
  if (io && accountId) io.in(`user_${accountId}`).disconnectSockets(true);
}

module.exports = { resolveSocketAccount, cleanChatContent, disconnectAccount, MAX_CHAT_LENGTH };
