// Xác thực kết nối Socket.IO (thời gian thực) - chạy 1 lần khi trình duyệt mở kết nối.
// 4 loại kết nối: khách chat chưa đăng nhập (chatToken), nhân viên hỗ trợ (support), người đã đăng nhập (token),
// và kết nối công khai không token (chỉ theo dõi trạng thái đơn qua mã tra cứu).
const jwt = require('jsonwebtoken'); // kiểm tra access token
const User = require('../models/User'); // khách hàng
const Admin = require('../models/Admin'); // admin / nhân viên
const { guestConversation, staffIdentity } = require('../services/chatSupport'); // xác thực cho chat

async function socketAuth(socket, next) {
  try {
    if (socket.handshake.auth?.chatToken) { // khách vãng lai đang chat
      await guestConversation(socket.handshake.auth.chatToken); // mã chat sai -> ném lỗi
      return next(); // hợp lệ -> cho kết nối
    }
    if (socket.handshake.auth?.support) { // nhân viên mở màn hình chat hỗ trợ
      const { account } = await staffIdentity(socket.handshake.auth.token); // kiểm tra token + quyền chat
      socket.userId = String(account._id); socket.userRole = account.role; // gắn danh tính vào kết nối
      return next();
    }
    const token = socket.handshake.auth?.token; // token đăng nhập (nếu có)
    if (!token) return next(); // Kết nối công khai (theo dõi đơn hàng) vẫn được phép, nhưng không có danh tính
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET); // sai / hết hạn -> ném lỗi
    const account = await (decoded.role === 'customer' ? User : Admin).findById(decoded.id); // tìm đúng collection
    if (!account?.isActive || (decoded.tv || 0) !== (account.tokenVersion || 0)) throw new Error(); // bị khóa / đã đổi mật khẩu
    socket.userId = decoded.id; // dùng để vào phòng user_<id>
    socket.userRole = decoded.role === 'customer' ? 'customer' : account.role; // vai trò lấy từ DB (không tin token)
    next();
  } catch { next(new Error('Phiên kết nối không hợp lệ hoặc đã hết hạn')); } // từ chối kết nối
}
module.exports = socketAuth;
