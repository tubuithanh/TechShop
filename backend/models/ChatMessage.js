const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId },
    senderName: { type: String, default: '' },
    senderRole: { type: String, enum: ['customer', 'staff', 'admin'], required: true },
    content: { type: String, default: '', maxlength: 2000 },
    attachments: [{ _id: false, attachmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
      name: String, mimeType: String, size: Number }],
    stickerId: String,
    clientMessageId: String
  },
  { timestamps: true, collection: 'chat_messages' }
);
chatMessageSchema.pre('validate', function (next) {
  if (!this.content?.trim() && !this.attachments?.length && !this.stickerId) this.invalidate('content', 'Tin nhắn trống');
  next();
});
chatMessageSchema.index({ conversationId: 1, clientMessageId: 1 }, {
  unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } }
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
