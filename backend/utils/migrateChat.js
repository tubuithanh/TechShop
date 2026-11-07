const mongoose = require('mongoose');
const PermissionGroup = require('../models/PermissionGroup');
const ChatConversation = require('../models/ChatConversation');
const ChatMessage = require('../models/ChatMessage');
const ChatAttachment = require('../models/ChatAttachment');
const User = require('../models/User');

async function migrateChat() {
  await Promise.all([PermissionGroup.init(), ChatConversation.init(), ChatMessage.init(), ChatAttachment.init()]);
  let group = await PermissionGroup.findOne({ code: 'customer_support' });
  if (!group) {
    group = await PermissionGroup.findOne({ name: 'Chăm sóc khách hàng' });
    if (group) {
      // The system code is immutable during normal edits; only migration assigns it to old data.
      await PermissionGroup.collection.updateOne({ _id: group._id }, { $set: { code: 'customer_support' } });
    } else {
      await PermissionGroup.findOneAndUpdate({ code: 'customer_support' }, { $setOnInsert: {
        name: 'Chăm sóc khách hàng', description: 'Tiếp nhận và chat hỗ trợ khách hàng',
        permissions: ['chat.support', 'orders.manage', 'customers.view']
      } }, { upsert: true, new: true });
    }
  }
  // A separate conversation record wraps existing messages; their IDs and history stay intact.
  const ids = await ChatMessage.distinct('conversationId');
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id) || await ChatConversation.exists({ _id: id })) continue;
    const user = await User.findById(id).lean();
    const latest = await ChatMessage.findOne({ conversationId: id }).sort({ createdAt: -1 }).lean();
    await ChatConversation.updateOne({ _id: id }, { $setOnInsert: {
      legacyId: id, userId: user?._id || null,
      customer: { name: user?.displayName || 'Khách hàng cũ', email: user?.email || '', phone: user?.phoneNumber || 'Chưa cung cấp', gender: '' },
      status: 'waiting', lastMessage: latest.content, lastMessageAt: latest.createdAt
    } }, { upsert: true });
  }
}
module.exports = { migrateChat };
