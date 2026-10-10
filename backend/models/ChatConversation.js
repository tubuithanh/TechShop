const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  customer: {
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, required: true },
    gender: { type: String, enum: ['', 'male', 'female', 'other'], default: '' }
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sessionHash: { type: String, select: false },
  initialContent: { type: String, select: false, default: '' },
  sessionExpiresAt: Date,
  legacyId: String,
  status: { type: String, enum: ['waiting', 'active', 'closed'], default: 'waiting' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  lastMessage: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  customerUnread: { type: Number, default: 0 },
  staffUnread: { type: Number, default: 0 },
  closedAt: Date,
  closedBy: { type: new mongoose.Schema({ agentId: mongoose.Schema.Types.ObjectId, name: String, role: String }, { _id: false }) },
  agentAtClose: { type: new mongoose.Schema({ agentId: mongoose.Schema.Types.ObjectId, name: String }, { _id: false }) },
  rating: { type: new mongoose.Schema({
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000 },
    submittedAt: { type: Date, required: true }
  }, { _id: false }) }
}, { timestamps: true, collection: 'chat_conversations' });
schema.index({ sessionHash: 1 }, { unique: true, sparse: true });
schema.index({ legacyId: 1 }, { unique: true, sparse: true });
schema.index({ status: 1, lastMessageAt: -1 });
module.exports = mongoose.model('ChatConversation', schema);
