// Ngắt mọi kết nối Socket.IO đang mở của 1 tài khoản - gọi khi khóa tài khoản, đổi quyền hoặc đổi / đặt lại mật
// khẩu, để quyền cũ không còn hiệu lực trên kết nối đang mở (trước đây kéo dài tới khi người dùng tải lại trang).
// Mỗi tài khoản luôn ở phòng user_<id> (utils/socketServer.js) nên chỉ cần ngắt phòng đó. Trình duyệt kết nối lại
// bằng token hiện tại; middlewares/socketAuth.js chỉ nhận lại nếu token và tài khoản còn hợp lệ.
function disconnectAccount(req, accountId) {
  const io = req.app?.get('io');
  if (io && accountId) io.in(`user_${accountId}`).disconnectSockets(true);
}

module.exports = { disconnectAccount };
