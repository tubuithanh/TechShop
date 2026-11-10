const mongoose = require('mongoose');
module.exports = mongoose.model('OrderTransfer', new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  fromStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  toStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  reason: String, customerConsent: Boolean,
  fromStoreName: String, toStoreName: String, requestedByName: String, decidedByName: String,
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  decidedAt: Date, decisionNote: String
}, { timestamps: true }).index({ fromStoreId: 1, status: 1, createdAt: 1 }).index({ toStoreId: 1, status: 1, createdAt: 1 }));
