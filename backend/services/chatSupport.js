const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const ChatConversation = require('../models/ChatConversation');
const { hasPermission } = require('../middlewares/authMiddleware');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const fail = (status, message) => Object.assign(new Error(message), { statusCode: status });

async function guestConversation(token) {
  if (!validToken(token)) throw fail(401, 'Phiên chat không hợp lệ hoặc đã hết hạn');
  const conversation = await ChatConversation.findOne({ sessionHash: hashToken(token), sessionExpiresAt: { $gt: new Date() } });
  if (!conversation) throw fail(401, 'Phiên chat không hợp lệ hoặc đã hết hạn');
  return conversation;
}

async function staffIdentity(token) {
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (!['admin', 'staff'].includes(decoded.role)) throw fail(403, 'Không có quyền hỗ trợ chat');
  const account = await Admin.findById(decoded.id).populate('groupIds', 'name code permissions');
  const req = { account, accountRole: account?.role };
  if (!account?.isActive || (decoded.tv || 0) !== (account.tokenVersion || 0) || !hasPermission(req, 'chat.support')) {
    throw fail(403, 'Không có quyền hỗ trợ chat');
  }
  return { account, role: account.role };
}

function normalizeMessage(m) {
  return { _id: m._id, conversationId: m.conversationId, content: m.content,
    clientMessageId: m.clientMessageId, createdAt: m.createdAt,
    attachments: m.attachments || [], stickerId: m.stickerId,
    sender: { _id: m.senderId, name: m.senderName || (m.senderRole === 'customer' ? 'Khách hàng' : 'Nhân viên'), role: m.senderRole } };
}

async function safeConversation(id) {
  return ChatConversation.findById(id).populate('assignedTo', 'name isActive').lean();
}

// Serialize message/read/status changes on this server; claims also use an atomic DB condition.
const locks = new Map();
async function withConversationLock(id, work) {
  const key = String(id);
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  locks.set(key, current);
  try { return await current; } finally { if (locks.get(key) === current) locks.delete(key); }
}

async function notifyChat(io, conversation, message) {
  if (!io) return;
  const data = await safeConversation(conversation._id);
  for (const socket of await io.fetchSockets()) {
    try {
      if (socket.handshake.auth?.chatToken) {
        const own = await guestConversation(socket.handshake.auth.chatToken);
        if (String(own._id) !== String(conversation._id)) continue;
        socket.emit('chat:conversation', data);
        if (message) socket.emit('chat:message', normalizeMessage(message));
      } else if (socket.handshake.auth?.support) {
        const identity = await staffIdentity(socket.handshake.auth.token);
        socket.emit('chat:changed', { conversationId: String(conversation._id) });
        if (identity.role === 'admin' || String(conversation.assignedTo) === String(identity.account._id)) {
          socket.emit('chat:conversation', data);
          if (message) socket.emit('chat:message', normalizeMessage(message));
        }
      }
    } catch { socket.disconnect(true); }
  }
}

async function onlineCount(io) {
  const ids = new Set();
  if (io) for (const socket of await io.fetchSockets()) {
    if (!socket.data.acceptingChat || !socket.handshake.auth?.support) continue;
    try { ids.add(String((await staffIdentity(socket.handshake.auth.token)).account._id)); } catch { socket.disconnect(true); }
  }
  return ids.size;
}

function registerChatSockets(io) {
  io.on('connection', (socket) => {
    socket.data.acceptingChat = false;
    const authorize = async () => socket.handshake.auth.chatToken
      ? { conversation: await guestConversation(socket.handshake.auth.chatToken) }
      : await staffIdentity(socket.handshake.auth.token);
    socket.on('chat:availability', async (value, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      try {
        if (!socket.handshake.auth.support) throw fail(403, 'Không có quyền hỗ trợ chat');
        await staffIdentity(socket.handshake.auth.token);
        socket.data.acceptingChat = value === true;
        ack({ ok: true });
      } catch (err) { ack({ error: err.message }); socket.disconnect(true); }
    });
    socket.on('chat:typing', async (payload = {}) => {
      if (Date.now() - (socket.data.lastTypingAt || 0) < 800) return;
      socket.data.lastTypingAt = Date.now();
      try {
        const identity = await authorize();
        const conversation = identity.conversation || await ChatConversation.findById(payload.conversationId);
        if (!conversation || conversation.status !== 'active') return;
        if (identity.account && identity.role !== 'admin' && String(conversation.assignedTo) !== String(identity.account._id)) return;
        for (const target of await io.fetchSockets()) {
          if (target.id === socket.id) continue;
          try {
            if (identity.conversation && target.handshake.auth.support) {
              const staff = await staffIdentity(target.handshake.auth.token);
              if (staff.role === 'admin' || String(staff.account._id) === String(conversation.assignedTo)) {
                target.emit('chat:typing', { conversationId: String(conversation._id), role: 'customer', name: conversation.customer.name });
              }
            } else if (identity.account && target.handshake.auth.chatToken) {
              const own = await guestConversation(target.handshake.auth.chatToken);
              if (String(own._id) === String(conversation._id)) target.emit('chat:typing', {
                conversationId: String(conversation._id), role: 'staff', name: identity.account.name
              });
            }
          } catch { target.disconnect(true); }
        }
      } catch { socket.disconnect(true); }
    });
  });
}

module.exports = { hashToken, validToken, fail, guestConversation, staffIdentity, normalizeMessage,
  safeConversation, withConversationLock, notifyChat, onlineCount, registerChatSockets };
