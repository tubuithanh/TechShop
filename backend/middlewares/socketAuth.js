const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { guestConversation, staffIdentity } = require('../services/chatSupport');

async function socketAuth(socket, next) {
  try {
    if (socket.handshake.auth?.chatToken) {
      await guestConversation(socket.handshake.auth.chatToken);
      return next();
    }
    if (socket.handshake.auth?.support) {
      const { account } = await staffIdentity(socket.handshake.auth.token);
      socket.userId = String(account._id); socket.userRole = account.role;
      return next();
    }
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // Public order-tracking connections still work.
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const account = await (decoded.role === 'customer' ? User : Admin).findById(decoded.id);
    if (!account?.isActive || (decoded.tv || 0) !== (account.tokenVersion || 0)) throw new Error();
    socket.userId = decoded.id;
    socket.userRole = decoded.role === 'customer' ? 'customer' : account.role;
    next();
  } catch { next(new Error('Phiên kết nối không hợp lệ hoặc đã hết hạn')); }
}
module.exports = socketAuth;
