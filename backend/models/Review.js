const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

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
    reviewKey: String,
    images: [String],
    isVerifiedPurchase: { type: Boolean, default: false },
    // Đánh giá nhiều tiêu chí (utils/reviewCriteria.js): điểm từng tiêu chí 1-5 (không bắt buộc), thẻ nhận xét nhanh,
    // ẩn danh (hiện tên dạng "N***n"), phân loại đã mua (màu / dung lượng) lấy từ đơn hàng
    criteria: {
      quality: { type: Number, min: 1, max: 5 },
      accuracy: { type: Number, min: 1, max: 5 },
      packaging: { type: Number, min: 1, max: 5 },
      delivery: { type: Number, min: 1, max: 5 },
      service: { type: Number, min: 1, max: 5 }
    },
    tags: [String],
    isAnonymous: { type: Boolean, default: false },
    variantLabel: { type: String, default: '' },
    // Khách khác bấm "Hữu ích"
    helpfulBy: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
    helpfulCount: { type: Number, default: 0 },
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
    editedAt: { type: Date, default: null }, // lần khách sửa đánh giá gần nhất (hiển thị "Đã chỉnh sửa")
    reply: {
      content: String,
      repliedAt: Date,
      repliedBy: { type: mongoose.Schema.Types.ObjectId }
    }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'reviews' }
);

reviewSchema.index({ productId: 1 });
reviewSchema.index({ reviewKey: 1 }, { unique: true, partialFilterExpression: { reviewKey: { $type: 'string' } } });

// Tìm kiếm không dấu: tên khách, nội dung, tên sản phẩm
reviewSchema.plugin(searchablePlugin, {
  getParts: async (doc) => {
    const product = doc.productId?.title !== undefined ? doc.productId : doc.productId ? await mongoose.model('Product').findById(doc.productId).select('title').lean() : null;
    return [doc.displayName, doc.message, product?.title];
  }
});

module.exports = mongoose.model('Review', reviewSchema);
