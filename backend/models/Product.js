const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    shortDescription: { type: String, default: '' },
    description: { type: String, default: '' },
    featuredImage: { type: String, default: '' },
    imageURLs: [String],
    price: { type: Number, required: true },
    salePrice: { type: Number },
    isFeatured: { type: Boolean, default: false },

    // ----- Các trường mở rộng thêm cho đồ án (không có trong schema gốc nhưng không vi phạm
    // validator vì $jsonSchema không đặt additionalProperties: false) -----
    specifications: { type: Map, of: String, default: {} }, // thông số kỹ thuật linh hoạt
    warrantyMonths: { type: Number, default: 12 },
    tags: [String], // "Hàng mới", "Trả góp 0%"...
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'products' }
);

productSchema.index({ title: 'text', shortDescription: 'text' });
productSchema.index({ categoryId: 1 });
productSchema.index({ brandId: 1 });
productSchema.index({ price: 1 });

module.exports = mongoose.model('Product', productSchema);
