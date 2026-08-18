const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    displayName: { type: String, default: '' },
    photoURL: { type: String, default: '' },
    message: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },

    // Mở rộng thêm
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    images: [String],
    isVerifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
    reply: {
      content: String,
      repliedAt: Date,
      repliedBy: { type: mongoose.Schema.Types.ObjectId }
    }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'reviews' }
);

reviewSchema.index({ productId: 1 });

module.exports = mongoose.model('Review', reviewSchema);
