const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderRole: { type: String, enum: ['customer', 'staff', 'admin'], required: true },
    content: { type: String, required: true }
  },
  { timestamps: true, collection: 'chat_messages' }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
