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
    // Giá THẬT khách phải trả - luôn được tính lại tự động (xem hook pre('validate') bên dưới),
    // không cho phép ghi trực tiếp. Tồn tại vì "giá gốc" (price) và "giá thật" (salePrice||price)
    // có thể khác nhau, mà việc lọc/sắp xếp theo giá trên trang danh sách sản phẩm PHẢI dùng đúng
    // giá thật khách trả, không phải giá gốc trước khuyến mãi.
    effectivePrice: { type: Number },
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
productSchema.index({ effectivePrice: 1 });

// Không cho phép giá khuyến mãi cao hơn giá gốc (dữ liệu vô lý, sẽ hiển thị sai trên ProductCard),
// và luôn tính lại effectivePrice = giá thật khách trả, để lọc/sắp xếp theo giá trên danh sách sản
// phẩm phản ánh đúng số tiền khách phải trả thay vì giá gốc trước khuyến mãi.
productSchema.pre('validate', function (next) {
  if (this.salePrice != null && this.price != null && this.salePrice > this.price) {
    return next(new Error('Giá khuyến mãi không được lớn hơn giá gốc'));
  }
  this.effectivePrice = this.salePrice != null && this.salePrice >= 0 ? this.salePrice : this.price;
  next();
});

module.exports = mongoose.model('Product', productSchema);
