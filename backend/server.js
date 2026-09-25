require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = require('./app');
const connectDB = require('./config/db');
const ChatMessage = require('./models/ChatMessage');
const User = require('./models/User');
const Admin = require('./models/Admin');

const PORT = process.env.PORT || 5000;
const HTTPS_PORT = process.env.HTTPS_PORT || 5443;

connectDB();

const server = http.createServer(app);

// Server HTTPS song song (dùng chung app Express) chỉ để phục vụ callback đăng nhập Zalo -
// Zalo bắt buộc Home URL/Callback URL phải là https, kể cả khi test trên localhost. Chứng chỉ
// tự ký (self-signed) trong backend/certs/ nên KHÔNG commit lên git (đã thêm vào .gitignore).
// Không ảnh hưởng tới luồng http://localhost:5000 hiện có của app (frontend vẫn gọi qua đó).
const certKeyPath = path.join(__dirname, 'certs', 'key.pem');
const certPath = path.join(__dirname, 'certs', 'cert.pem');
if (fs.existsSync(certKeyPath) && fs.existsSync(certPath)) {
  https
    .createServer({ key: fs.readFileSync(certKeyPath), cert: fs.readFileSync(certPath) }, app)
    .listen(HTTPS_PORT, () => {
      console.log(`[Server] HTTPS (dùng cho callback Zalo) chạy tại https://localhost:${HTTPS_PORT}`);
    });
}

// ----- Socket.io: real-time (theo dõi đơn hàng, thông báo, chat) -----
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // cho phép kết nối ẩn danh (VD: trang theo dõi công khai)
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    socket.userId = decoded.id;
    socket.userRole = decoded.role; // 'customer' | 'staff' | 'admin'
    next();
  } catch (err) {
    next(); // token sai vẫn cho kết nối nhưng không join phòng riêng
  }
});

const STAFF_ROLES = ['staff', 'admin'];

io.on('connection', (socket) => {
  if (socket.userId) {
    socket.join(`user_${socket.userId}`);
    // Mọi nhân viên/admin đang online cùng vào 1 phòng chung để bất kỳ ai cũng nhận được tin nhắn
    // mới từ khách hàng theo thời gian thực (trước đây tin chỉ được đẩy tới 1 admin cố định do
    // ChatWidget chọn qua getSupportAgent(), các admin khác phải tự F5 mới thấy).
    if (STAFF_ROLES.includes(socket.userRole)) socket.join('support_room');
    console.log(`[Socket.io] Tài khoản ${socket.userId} (${socket.userRole}) đã kết nối (${socket.id})`);
  }

  // Chat giữa khách hàng và CSKH — có lưu lịch sử vào MongoDB (mở rộng mục 1.1.12)
  // Người gửi có thể thuộc collection "users" (customer) hoặc "admins" (staff/admin)
  socket.on('chat:message', async (payload) => {
    if (!socket.userId) return;

    try {
      const isCustomer = socket.userRole === 'customer';
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
        content: payload.content
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

server.listen(PORT, () => {
  console.log(`[Server] Đang chạy tại http://localhost:${PORT}`);
});
