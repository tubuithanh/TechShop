const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    displayName: { type: String, default: '' },
    photoURL: { type: String, default: '' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    category: { type: String, default: 'tin_tuc' },
    nameAuthor: { type: String, default: '' },
    featuredImage: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    content: { type: String, required: true },
    isFeatured: { type: Boolean, default: false },
    comments: [commentSchema],

    // Mở rộng thêm
    relatedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    isPublished: { type: Boolean, default: true },
    viewCount: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'posts' }
);

postSchema.index({ title: 'text', shortDescription: 'text' });

// Tìm kiếm không dấu: tiêu đề, mô tả ngắn, tác giả
postSchema.plugin(searchablePlugin, { getParts: (doc) => [doc.title, doc.shortDescription, doc.nameAuthor] });

module.exports = mongoose.model('Post', postSchema);
