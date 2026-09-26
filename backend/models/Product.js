const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');
const { computeSpecNumbers } = require('../utils/specNumbers');

// Phiên bản bán ra của sản phẩm (màu × dung lượng/kích thước) - mỗi phiên bản có giá, ảnh và TỒN
// KHO RIÊNG (StoreInventory theo variantId). _id của phiên bản chính là mã phiên bản (SKU) dùng trong
// giỏ hàng/đơn hàng/tồn kho.
const variantSchema = new mongoose.Schema({
  color: { type: String, required: true, trim: true },
  colorHex: { type: String, default: '#9ca3af' },
  storage: { type: String, default: '', trim: true }, // dung lượng/kích thước, VD: "256GB", "45mm"; trống nếu chỉ khác màu
  price: { type: Number, required: true, min: 0 },
  salePrice: { type: Number, min: 0 },
  effectivePrice: { type: Number }, // tự tính trong hook, không ghi trực tiếp
  image: { type: String, default: '' }, // ảnh riêng của màu này; trống = dùng ảnh chung của sản phẩm
  isActive: { type: Boolean, default: true }
});

variantSchema.virtual('label').get(function () {
  return this.storage ? `${this.color} - ${this.storage}` : this.color;
});
variantSchema.set('toJSON', { virtuals: true });
variantSchema.set('toObject', { virtuals: true });

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
    // price/salePrice/effectivePrice ở cấp sản phẩm = của phiên bản ĐANG BÁN rẻ nhất, tự tính trong hook
    // (dùng cho thẻ sản phẩm "từ X đ", lọc & sắp xếp theo giá). Giá thật khi mua lấy theo phiên bản.
    price: { type: Number, required: true },
    salePrice: { type: Number },
    variants: { type: [variantSchema], default: [] },
    // Giá THẬT khách phải trả - luôn được tính lại tự động (xem hook pre('validate') bên dưới),
    // không cho phép ghi trực tiếp. Tồn tại vì "giá gốc" (price) và "giá thật" (salePrice||price)
    // có thể khác nhau, mà việc lọc/sắp xếp theo giá trên trang danh sách sản phẩm PHẢI dùng đúng
    // giá thật khách trả, không phải giá gốc trước khuyến mãi.
    effectivePrice: { type: Number },
    isFeatured: { type: Boolean, default: false },

    // ----- Các trường mở rộng thêm cho đồ án (không có trong schema gốc nhưng không vi phạm
    // validator vì $jsonSchema không đặt additionalProperties: false) -----
    specifications: { type: Map, of: String, default: {} }, // thông số kỹ thuật linh hoạt
    // Giá trị SỐ tách ra từ specifications (VD: "8GB" -> 8) cho các trường dạng số - tự tính lại ở
    // hook pre('validate'), không ghi trực tiếp. Dùng cho bộ lọc theo thông số và so sánh "tốt hơn".
    specNumbers: { type: Map, of: Number, default: {} },
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
productSchema.pre('validate', async function () {
  if (!this.variants || this.variants.length === 0) {
    throw new Error('Sản phẩm phải có ít nhất 1 phiên bản (màu/dung lượng)');
  }
  const seen = new Set();
  for (const v of this.variants) {
    if (v.salePrice != null && v.salePrice > v.price) {
      throw new Error(`Phiên bản "${v.label}": giá khuyến mãi không được lớn hơn giá gốc`);
    }
    const key = `${v.color}|${v.storage}`.toLowerCase();
    if (seen.has(key)) throw new Error(`Phiên bản "${v.label}" bị trùng`);
    seen.add(key);
    v.effectivePrice = v.salePrice != null ? v.salePrice : v.price;
  }
  // Giá cấp sản phẩm lấy theo phiên bản đang bán rẻ nhất (nếu tất cả đã ngừng bán thì xét mọi phiên bản)
  const selling = this.variants.filter((v) => v.isActive);
  const cheapest = (selling.length ? selling : this.variants).reduce((a, b) => (b.effectivePrice < a.effectivePrice ? b : a));
  this.price = cheapest.price;
  this.salePrice = cheapest.salePrice;
  this.effectivePrice = cheapest.effectivePrice;

  // Tách giá trị số theo đúng mẫu của danh mục sản phẩm (cần slug danh mục) - chỉ tính lại khi thông
  // số hoặc danh mục thay đổi, tránh 1 truy vấn thừa ở mọi lần lưu khác (VD: cập nhật tồn kho, giá).
  if (this.isNew || this.isModified('specifications') || this.isModified('categoryId')) {
    const category = this.categoryId
      ? await mongoose.model('Category').findById(this.categoryId).select('slug').lean()
      : null;
    this.specNumbers = computeSpecNumbers(this.specifications, category?.slug);
  }
});

// Tìm kiếm không dấu: tên, danh mục, thương hiệu, mô tả ngắn, màu/dung lượng các phiên bản, nhãn - để
// khách gõ "điện thoại samsung" vẫn ra "Galaxy S24" dù tên sản phẩm không có chữ "điện thoại" (xem utils/search.js)
productSchema.plugin(searchablePlugin, {
  getParts: async (doc) => {
    // brandId/categoryId có thể đã được populate sẵn (script cập nhật dữ liệu) - khi đó không cần truy vấn lại
    const lookup = async (ref, model) =>
      ref?.name !== undefined ? ref : ref ? await mongoose.model(model).findById(ref).select('name').lean() : null;
    const [brand, category] = await Promise.all([lookup(doc.brandId, 'Brand'), lookup(doc.categoryId, 'Category')]);
    return [doc.title, category?.name, brand?.name, doc.shortDescription, (doc.variants || []).map((v) => [v.color, v.storage]), doc.tags];
  }
});

module.exports = mongoose.model('Product', productSchema);
