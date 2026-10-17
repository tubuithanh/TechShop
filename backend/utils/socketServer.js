// Thiết lập Socket.IO (theo dõi đơn hàng, thông báo, chat hỗ trợ) trên 1 HTTP server - tách khỏi server.js để
// test kết nối thật được (tests/socket.test.js).
// Xác thực kết nối: middlewares/socketAuth.js (tài khoản còn hoạt động, tokenVersion khớp, vai trò lấy từ cơ sở
// dữ liệu, chat hỗ trợ cần quyền chat.support). Tin nhắn chat gửi qua API HTTP (services/chatSupport.js).
const { Server } = require('socket.io');
const socketAuth = require('../middlewares/socketAuth');
const { registerChatSockets } = require('../services/chatSupport');

function attachSocket(server, app) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true
    }
  });

  io.use(socketAuth);
  registerChatSockets(io);

  io.on('connection', (socket) => {
    // Mỗi tài khoản vào phòng user_<id>: nhận cập nhật đơn hàng / bảo hành; bị ngắt cả phòng khi khóa tài khoản
    // hoặc đổi mật khẩu (utils/socketAuth.js -> disconnectAccount)
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
      console.log(`[Socket.io] Tài khoản ${socket.userId} (${socket.userRole}) đã kết nối (${socket.id})`);
    }
    socket.on('disconnect', () => {
      console.log(`[Socket.io] Ngắt kết nối: ${socket.id}`);
    });
  });

  app.set('io', io);
  return io;
}

module.exports = { attachSocket };
