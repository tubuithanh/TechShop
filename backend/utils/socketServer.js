// Thiết lập Socket.IO (theo dõi đơn hàng, thông báo, chat) trên 1 HTTP server - tách khỏi server.js để test
// kết nối thật được (tests/socket.test.js).
const { Server } = require('socket.io');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { resolveSocketAccount, cleanChatContent } = require('./socketAuth');

function attachSocket(server, app) {
  // ----- Socket.io: real-time (theo dõi đơn hàng, thông báo, chat) -----
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true
    }
  });

  // Không có token / token sai / tài khoản bị khóa vẫn cho kết nối (ẩn danh), nhưng không vào phòng riêng nào
  io.use(async (socket, next) => {
    try {
      const account = await resolveSocketAccount(socket.handshake.auth?.token);
      if (account) {
        socket.userId = account.userId;
        socket.userRole = account.role; // 'customer' | 'staff' | 'admin' - lấy từ cơ sở dữ liệu
        socket.canSupport = account.canSupport;
      }
    } catch (err) {
      console.error('[Socket.io] Lỗi xác thực kết nối:', err.message);
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
      // Admin và nhân viên có quyền chat.support cùng vào 1 phòng chung để ai cũng nhận được tin nhắn
      // mới từ khách hàng theo thời gian thực. Nhân viên không có quyền này không được đọc chat của khách
      // (giống API /api/chat).
      if (socket.canSupport) socket.join('support_room');
      console.log(`[Socket.io] Tài khoản ${socket.userId} (${socket.userRole}) đã kết nối (${socket.id})`);
    }

    // Chat giữa khách hàng và CSKH — có lưu lịch sử vào MongoDB (mở rộng mục 1.1.12)
    // Người gửi có thể thuộc collection "users" (customer) hoặc "admins" (staff/admin)
    socket.on('chat:message', async (payload) => {
      if (!socket.userId) return;
      const content = cleanChatContent(payload?.content);
      if (!content) return;

      try {
        const isCustomer = socket.userRole === 'customer';
        if (!isCustomer && !socket.canSupport) return; // nhân viên phải có quyền chat.support mới trả lời được
        const Model = isCustomer ? User : Admin;
        const sender = await Model.findById(socket.userId).select('displayName name role');
        if (!sender) return;

        const senderName = sender.displayName || sender.name;

        // KHÔNG tin conversationId/toUserId do client tự gửi lên cho khách hàng - mỗi khách hàng chỉ
        // có đúng 1 hội thoại (conversationId = userId của chính họ theo thiết kế). Nếu tin từ client
        // được dùng trực tiếp, một khách hàng có thể tự đặt conversationId thành userId của người
        // khác để chèn tin nhắn giả vào lịch sử chat của họ, hoặc đặt toUserId tuỳ ý để đẩy tin nhắn
        // thời gian thực vào phòng socket của bất kỳ ai. Nhân viên/admin được phép chọn đúng hội
        // thoại (khách hàng) đang trả lời.
        const conversationId = isCustomer ? socket.userId : payload.conversationId;
        if (!conversationId) return;

        const message = await ChatMessage.create({
          conversationId,
          senderId: socket.userId,
          senderRole: isCustomer ? 'customer' : sender.role,
          content
        });

        const outgoing = {
          _id: message._id,
          conversationId: message.conversationId,
          content: message.content,
          sender: { _id: socket.userId, name: senderName, role: isCustomer ? 'customer' : sender.role },
          createdAt: message.createdAt
        };

        if (isCustomer) {
          io.to('support_room').emit('chat:message', outgoing);
        } else {
          io.to(`user_${conversationId}`).emit('chat:message', outgoing);
        }
        socket.emit('chat:message', outgoing);
      } catch (err) {
        console.error('[Socket.io] Lỗi lưu tin nhắn chat:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Ngắt kết nối: ${socket.id}`);
    });
  });
  app.set('io', io);
  return io;
}

module.exports = { attachSocket };
