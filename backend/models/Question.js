const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userType: { type: String, enum: ['user', 'admin'], default: 'user' },
    isFromShop: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const questionSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    answers: [answerSchema]
  },
  { timestamps: true, collection: 'questions' }
);

questionSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('Question', questionSchema);
