const mongoose = require('mongoose');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const ChatAttachment = require('../models/ChatAttachment');
const stickers = require('../data/chatStickers.json');
const Admin = require('../models/Admin');
const asyncHandler = require('../utils/asyncHandler');
const { hashToken, validToken, fail, guestConversation, normalizeMessage, safeConversation,
  withConversationLock, notifyChat, onlineCount } = require('../services/chatSupport');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const tokenFrom = (req) => req.get('X-Chat-Token');
const ioFrom = (req) => req.app.get('io');
const idFrom = (req) => {
  if (!mongoose.isValidObjectId(req.params.conversationId)) throw fail(404, 'Không tìm thấy hội thoại');
  return req.params.conversationId;
};
const trim = (v) => typeof v === 'string' ? v.trim() : '';

const startChat = asyncHandler(async (req, res) => {
  const token = tokenFrom(req);
  if (!validToken(token)) throw fail(400, 'Mã phiên chat không hợp lệ');
  const customer = { name: trim(req.body.name), email: trim(req.body.email).toLowerCase(),
    phone: trim(req.body.phone).replace(/[\s.-]/g, '').replace(/^\+84/, '0'), gender: trim(req.body.gender) };
  const content = trim(req.body.content);
  const errors = {};
  if (customer.name.length < 2 || customer.name.length > 80) errors.name = 'Tên cần từ 2 đến 80 ký tự';
  if (!/^0[35789]\d{8}$/.test(customer.phone)) errors.phone = 'Nhập số điện thoại di động Việt Nam hợp lệ';
  if (customer.email && (customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) errors.email = 'Email không hợp lệ';
  if (!['', 'male', 'female', 'other'].includes(customer.gender)) errors.gender = 'Giới tính không hợp lệ';
  if (content.length > 2000 || (req.body.content != null && typeof req.body.content !== 'string')) errors.content = 'Tin nhắn tối đa 2.000 ký tự';
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Vui lòng kiểm tra thông tin', errors });
  const sessionHash = hashToken(token);
  await withConversationLock(sessionHash, async () => {
    let conversation = await ChatConversation.findOne({ sessionHash }).select('+initialContent');
    if (conversation && conversation.sessionExpiresAt <= new Date()) throw fail(401, 'Phiên chat đã hết hạn');
    if (!conversation) {
      try {
        conversation = await ChatConversation.create({ customer, sessionHash, initialContent: content,
          sessionExpiresAt: new Date(Date.now() + 7 * 86400000) });
      } catch (err) {
        if (err.code !== 11000) throw err;
        conversation = await ChatConversation.findOne({ sessionHash }).select('+initialContent');
      }
    }
    if (conversation.initialContent) {
      const message = await ChatMessage.findOneAndUpdate({ conversationId: String(conversation._id), clientMessageId: 'initial' },
        { $setOnInsert: { content: conversation.initialContent, senderRole: 'customer', senderName: conversation.customer.name } },
        { upsert: true, new: true, runValidators: true });
      if (!conversation.lastMessage) {
        await ChatConversation.updateOne({ _id: conversation._id }, { lastMessage: message.content,
          lastMessageAt: message.createdAt, staffUnread: 1 });
      }
    }
    await notifyChat(ioFrom(req), conversation);
    res.status(201).json({ data: await safeConversation(conversation._id), onlineCount: await onlineCount(ioFrom(req)) });
  });
});
const getGuestSession = asyncHandler(async (req, res) => {
  const conversation = await guestConversation(tokenFrom(req));
  res.json({ data: await safeConversation(conversation._id), onlineCount: await onlineCount(ioFrom(req)) });
});

async function accessibleConversation(req, guest = false) {
  const conversation = guest ? await guestConversation(tokenFrom(req)) : await ChatConversation.findById(idFrom(req));
  if (!conversation) throw fail(404, 'Không tìm thấy hội thoại');
  if (!guest && req.accountRole !== 'admin' && conversation.status !== 'waiting' &&
      String(conversation.assignedTo) !== String(req.account._id)) throw fail(403, 'Hội thoại do nhân viên khác phụ trách');
  return conversation;
}
async function history(req, res, guest) {
  const conversation = await accessibleConversation(req, guest);
  const query = { conversationId: String(conversation._id) };
  if (req.query.before) {
    if (!mongoose.isValidObjectId(req.query.before)) throw fail(400, 'Mốc phân trang không hợp lệ');
    query._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
  }
  const messages = await ChatMessage.find(query).sort({ _id: -1 }).limit(101);
  res.json({ data: messages.slice(0, 100).reverse().map(normalizeMessage), hasMore: messages.length > 100 });
}
const getGuestHistory = asyncHandler((req, res) => history(req, res, true));
const getChatHistory = asyncHandler((req, res) => history(req, res, false));

async function send(req, res, guest) {
  const content = trim(req.body.content);
  const clientMessageId = req.body.clientMessageId;
  const attachmentIds = req.body.attachmentIds ?? [];
  const stickerId = req.body.stickerId || undefined;
  if ((req.body.content != null && typeof req.body.content !== 'string') || content.length > 2000 || typeof clientMessageId !== 'string' || !UUID.test(clientMessageId) ||
      !Array.isArray(attachmentIds) || attachmentIds.length > 5 || attachmentIds.some((id) => typeof id !== 'string' || !mongoose.isValidObjectId(id)) ||
      new Set(attachmentIds).size !== attachmentIds.length || (stickerId && !stickers.some((s) => s.id === stickerId)) ||
      (!content && !attachmentIds.length && !stickerId)) throw fail(400, 'Tin nhắn, sticker hoặc tệp đính kèm không hợp lệ (tối đa 2.000 ký tự, 5 tệp)');
  const found = await accessibleConversation(req, guest);
  await withConversationLock(found._id, async () => {
    const conversation = await accessibleConversation(req, guest);
    const existing = await ChatMessage.findOne({ conversationId: String(conversation._id), clientMessageId });
    if (existing) {
      if ((existing.senderRole === 'customer') !== guest || (!guest && String(existing.senderId) !== String(req.account._id))) {
        throw fail(409, 'Mã tin nhắn đã được sử dụng');
      }
      return res.json({ data: normalizeMessage(existing) });
    }
    if (conversation.status === 'closed') throw fail(409, 'Hội thoại đã kết thúc, hãy bắt đầu cuộc chat mới');
    if (!guest && conversation.status !== 'active') throw fail(409, 'Cần tiếp nhận hội thoại trước khi trả lời');
    const ownerKey = guest ? `customer:${hashToken(tokenFrom(req))}` : `staff:${req.account._id}`;
    const attachments = await ChatAttachment.find({ _id: { $in: attachmentIds }, conversationId: conversation._id, ownerKey,
      expiresAt: { $gt: new Date() } });
    if (attachments.length !== attachmentIds.length || (attachmentIds.length && await ChatMessage.exists({
      conversationId: String(conversation._id), 'attachments.attachmentId': { $in: attachmentIds }
    }))) throw fail(400, 'Tệp không thuộc phiên này, đã được gửi hoặc đã hết hạn');
    // Promote drafts before persisting the message so TTL cannot delete a sent file.
    if (attachmentIds.length) await ChatAttachment.updateMany({ _id: { $in: attachmentIds }, ownerKey }, { $unset: { expiresAt: 1 } });
    let message;
    try {
      message = await ChatMessage.create({ conversationId: String(conversation._id), clientMessageId, content, stickerId,
        attachments: attachmentIds.map((id) => {
          const a = attachments.find((file) => String(file._id) === id);
          return { attachmentId: a._id, name: a.name, mimeType: a.mimeType, size: a.size };
        }),
        senderId: guest ? undefined : req.account._id,
        senderRole: guest ? 'customer' : req.accountRole,
        senderName: guest ? conversation.customer.name : req.account.name });
    } catch (err) {
      // Restore expiration only for files which no persisted message references.
      for (const a of attachments) {
        if (!await ChatMessage.exists({ 'attachments.attachmentId': a._id })) await ChatAttachment.updateOne({ _id: a._id }, { $set: { expiresAt: a.expiresAt } });
      }
      if (err.code !== 11000) throw err;
      message = await ChatMessage.findOne({ conversationId: String(conversation._id), clientMessageId });
      return res.json({ data: normalizeMessage(message) });
    }
    await ChatConversation.updateOne({ _id: conversation._id }, {
      $set: { lastMessage: content || (stickerId ? `[Sticker] ${stickers.find((s) => s.id === stickerId).label}` : `[Đính kèm] ${attachments.length} tệp`), lastMessageAt: message.createdAt },
      $inc: { [guest ? 'staffUnread' : 'customerUnread']: 1 }
    });
    await notifyChat(ioFrom(req), conversation, message);
    res.status(201).json({ data: normalizeMessage(message) });
  });
}
const sendGuestMessage = asyncHandler((req, res) => send(req, res, true));
const sendStaffMessage = asyncHandler((req, res) => send(req, res, false));

const getConversations = asyncHandler(async (req, res) => {
  const status = req.query.status || 'waiting';
  if (!['waiting', 'active', 'closed'].includes(status)) throw fail(400, 'Trạng thái không hợp lệ');
  const query = { status };
  if (req.accountRole !== 'admin' && status !== 'waiting') query.assignedTo = req.account._id;
  if (status === 'closed') {
    if (req.query.stars === 'unrated') query.rating = { $exists: false };
    else if (req.query.stars) {
      if (!/^[1-5]$/.test(req.query.stars)) throw fail(400, 'Số sao không hợp lệ');
      query['rating.stars'] = Number(req.query.stars);
    }
    if (req.accountRole === 'admin' && req.query.agent) {
      if (!mongoose.isValidObjectId(req.query.agent)) throw fail(400, 'Nhân viên không hợp lệ');
      query['agentAtClose.agentId'] = new mongoose.Types.ObjectId(req.query.agent);
    }
    for (const [key, operator] of [['from', '$gte'], ['to', '$lte']]) {
      if (req.query[key]) {
        const date = new Date(req.query[key]);
        if (!Number.isFinite(date.getTime())) throw fail(400, 'Ngày lọc không hợp lệ');
        query.closedAt = { ...query.closedAt, [operator]: date };
      }
    }
    if (query.closedAt?.$gte > query.closedAt?.$lte) throw fail(400, 'Ngày bắt đầu phải trước ngày kết thúc');
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [data, total, agents] = await Promise.all([
    ChatConversation.find(query).populate('assignedTo', 'name isActive').sort({ lastMessageAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
    ChatConversation.countDocuments(query),
    req.accountRole === 'admin' ? Admin.find({ isActive: true }).populate('groupIds', 'code permissions').lean() : []
  ]);
  const counts = {};
  for (const s of ['waiting', 'active', 'closed']) counts[s] = await ChatConversation.countDocuments({ status: s,
    ...(req.accountRole !== 'admin' && s !== 'waiting' ? { assignedTo: req.account._id } : {}) });
  const summary = status === 'closed' ? await ChatConversation.aggregate([
    { $match: { ...query, ...(query.assignedTo ? { assignedTo: new mongoose.Types.ObjectId(String(query.assignedTo)) } : {}) } },
    { $match: { 'rating.stars': { $exists: true } } },
    { $group: { _id: null, average: { $avg: '$rating.stars' }, count: { $sum: 1 } } }
  ]) : [];
  const ratingAgents = status === 'closed' && req.accountRole === 'admin' ? await ChatConversation.aggregate([
    { $match: { status: 'closed', 'agentAtClose.agentId': { $exists: true } } },
    { $sort: { closedAt: -1 } },
    { $group: { _id: '$agentAtClose.agentId', name: { $first: '$agentAtClose.name' } } },
    { $sort: { name: 1 } }
  ]) : [];
  res.json({ data, total, page, counts, ratingAgents, ratingSummary: { average: summary[0]?.average || 0, count: summary[0]?.count || 0 }, agents: agents.filter((a) => a.role === 'admin' || a.groupIds.some((g) =>
    g.code === 'customer_support' && g.permissions.includes('chat.support'))).map((a) => ({ _id: a._id, name: a.name })) });
});

const claimConversation = asyncHandler(async (req, res) => {
  const id = idFrom(req);
  await withConversationLock(id, async () => {
    const conversation = await ChatConversation.findOneAndUpdate({ _id: id, status: 'waiting', assignedTo: null },
      { $set: { assignedTo: req.account._id, status: 'active' } }, { new: true });
    if (!conversation) throw fail(409, 'Hội thoại đã được tiếp nhận hoặc đã kết thúc');
    await notifyChat(ioFrom(req), conversation);
    res.json({ data: await safeConversation(id) });
  });
});

const updateConversation = asyncHandler(async (req, res) => {
  const id = idFrom(req);
  await withConversationLock(id, async () => {
    const conversation = await accessibleConversation(req);
    if (conversation.status === 'closed') throw fail(409, 'Hội thoại đã kết thúc');
    const { action, assignedTo } = req.body;
    if (action === 'close') {
      if (conversation.status !== 'active' && req.accountRole !== 'admin') throw fail(409, 'Cần tiếp nhận hội thoại trước');
      conversation.status = 'closed'; conversation.closedAt = new Date();
      conversation.closedBy = { agentId: req.account._id, name: req.account.name, role: req.accountRole };
      const agent = conversation.assignedTo ? await Admin.findById(conversation.assignedTo).select('name') : null;
      conversation.agentAtClose = { agentId: agent?._id || req.account._id, name: agent?.name || req.account.name };
    } else if (action === 'release' || action === 'transfer') {
      if (req.accountRole !== 'admin') throw fail(403, 'Chỉ admin được chuyển người phụ trách');
      if (action === 'release') { conversation.status = 'waiting'; conversation.assignedTo = null; }
      else {
        if (!mongoose.isValidObjectId(assignedTo)) throw fail(400, 'Nhân viên không hợp lệ');
        const agent = await Admin.findById(assignedTo).populate('groupIds', 'code permissions');
        if (!agent?.isActive || (agent.role !== 'admin' && !agent.groupIds.some((g) => g.code === 'customer_support' && g.permissions.includes('chat.support')))) {
          throw fail(400, 'Nhân viên không có quyền CSKH hoặc đã bị khóa');
        }
        conversation.status = 'active'; conversation.assignedTo = agent._id;
      }
    } else throw fail(400, 'Thao tác không hợp lệ');
    await conversation.save();
    await notifyChat(ioFrom(req), conversation);
    res.json({ data: await safeConversation(id) });
  });
});

async function read(req, res, guest) {
  const conversation = await accessibleConversation(req, guest);
  await withConversationLock(conversation._id, async () => {
    await ChatConversation.updateOne({ _id: conversation._id }, { $set: { [guest ? 'customerUnread' : 'staffUnread']: 0 } });
    res.json({ data: await safeConversation(conversation._id) });
  });
}
const readGuest = asyncHandler((req, res) => read(req, res, true));
const readStaff = asyncHandler((req, res) => read(req, res, false));
const availability = asyncHandler(async (req, res) => res.json({ onlineCount: await onlineCount(ioFrom(req)) }));
const rateConversation = asyncHandler(async (req, res) => {
  const { stars } = req.body;
  const comment = trim(req.body.comment);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5 || comment.length > 1000 ||
      (req.body.comment != null && typeof req.body.comment !== 'string')) throw fail(400, 'Chọn từ 1 đến 5 sao, nhận xét tối đa 1.000 ký tự');
  const found = await accessibleConversation(req, true);
  await withConversationLock(found._id, async () => {
    const conversation = await accessibleConversation(req, true);
    if (conversation.status !== 'closed') throw fail(409, 'Chỉ đánh giá sau khi cuộc chat kết thúc');
    if (conversation.rating) {
      if (conversation.rating.stars !== stars || conversation.rating.comment !== comment) throw fail(409, 'Cuộc chat đã được đánh giá');
      return res.json({ data: await safeConversation(found._id) });
    }
    const rated = await ChatConversation.findOneAndUpdate({ _id: found._id, status: 'closed', rating: { $exists: false } },
      { $set: { rating: { stars, comment, submittedAt: new Date() } } }, { new: true, runValidators: true });
    if (!rated) throw fail(409, 'Cuộc chat đã được đánh giá');
    await notifyChat(ioFrom(req), rated);
    res.json({ data: await safeConversation(found._id) });
  });
});
module.exports = { startChat, getGuestSession, getGuestHistory, getChatHistory, sendGuestMessage,
  sendStaffMessage, getConversations, claimConversation, updateConversation, readGuest, readStaff, availability,
  accessibleConversation, rateConversation };
