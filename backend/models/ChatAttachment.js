const mongoose = require('mongoose');

// Each private file is a separate document (5 MB maximum, below MongoDB's document limit).
const schema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ownerKey: { type: String, required: true, select: false },
  clientFileId: { type: String, required: true, select: false },
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  digest: { type: String, required: true, select: false },
  data: { type: Buffer, required: true, select: false },
  expiresAt: Date
}, { timestamps: true, collection: 'chat_attachments' });
schema.index({ conversationId: 1, ownerKey: 1, clientFileId: 1 }, { unique: true });
// Uploaded drafts expire; a file linked to a persisted message has no expiration.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('ChatAttachment', schema);
