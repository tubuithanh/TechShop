const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Admin = require('../models/Admin');
const asyncHandler = require('../utils/asyncHandler');

const getSupportAgent = asyncHandler(async (req, res) => {
  const agent = await Admin.findOne({ isActive: true }).select('_id name');
  if (!agent) return res.status(404).json({ message: 'Hiện chưa có nhân viên hỗ trợ trực tuyến' });
  res.json({ data: agent });
});

const getChatHistory = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const isOwner = req.account._id.toString() === conversationId;
  const isStaffOrAdmin = ['staff', 'admin'].includes(req.accountRole);
  if (!isOwner && !isStaffOrAdmin) {
    return res.status(403).json({ message: 'Không có quyền xem hội thoại này' });
  }

  const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 }).limit(200);

  // Chuẩn hóa dữ liệu trả về giống format tin nhắn real-time từ Socket.io
  // (đóng gói sender: { _id, role }) để Frontend dùng chung 1 logic hiển thị
  const normalized = messages.map((m) => ({
    _id: m._id,
    conversationId: m.conversationId,
    content: m.content,
    sender: { _id: m.senderId, role: m.senderRole },
    createdAt: m.createdAt
  }));

  res.json({ data: normalized });
});

const getConversations = asyncHandler(async (req, res) => {
  const conversations = await ChatMessage.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$conversationId', lastMessage: { $first: '$content' }, lastMessageAt: { $first: '$createdAt' } } },
    { $sort: { lastMessageAt: -1 } },
    { $limit: 50 }
  ]);
  res.json({ data: conversations });
});

module.exports = { getChatHistory, getConversations, getSupportAgent };
