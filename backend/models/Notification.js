const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['order', 'promotion', 'warranty', 'system'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    isRead: { type: Boolean, default: false }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'notifications' }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
