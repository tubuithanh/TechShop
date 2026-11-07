const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  mimeType: String,
  data: { type: Buffer, select: false },
  expiresAt: Date
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('DeliveryEvidence', schema);
