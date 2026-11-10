const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

// Chương trình giảm giá TỰ ĐỘNG (khách không cần nhập mã) - mỗi chương trình là 1 chiến dịch marketing.
// Áp dụng lên từng dòng sản phẩm của đơn hàng nếu khớp đủ điều kiện:
//   - scope:    'all' (mọi sản phẩm) | 'categories' (danh mục) | 'brands' (thương hiệu) | 'products' (từng sản phẩm)
//   - storeIds: chỉ áp dụng ở các chi nhánh này (trống = mọi chi nhánh)
//   - tierKeys: chỉ áp dụng cho khách thuộc các hạng thành viên này (trống = mọi khách, kể cả khách vãng lai)
// Mỗi dòng sản phẩm chỉ nhận 1 chương trình có mức giảm CAO NHẤT (không cộng dồn nhiều chương trình).
// Mã giảm giá (Voucher) vẫn được cộng thêm sau khi đã trừ khuyến mãi.
const promotionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 }, // tên chiến dịch, VD "Back to School 2026"
    campaign: { type: String, trim: true, maxlength: 60, default: '' }, // nhóm chiến dịch / kênh marketing (VD "Facebook Ads")
    description: { type: String, trim: true, maxlength: 300, default: '' },
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    // percent: % trên giá bán; fixed: số tiền giảm trên MỖI sản phẩm
    discountValue: { type: Number, required: true, min: 1 },
    maxDiscountPerItem: { type: Number, min: 0 }, // trần giảm mỗi sản phẩm (chỉ dùng cho percent; trống = không giới hạn)
    scope: { type: String, enum: ['all', 'categories', 'brands', 'products'], default: 'all' },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    brandIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    storeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
    tierKeys: [{ type: String }],
    // Giới hạn chiến dịch (0 = không giới hạn): số đơn tối đa được hưởng, tổng tiền giảm tối đa (ngân sách).
    // usedCount / usedAmount tự cộng khi đặt hàng, tự trừ lại khi đơn bị hủy / trả hàng.
    usageLimit: { type: Number, default: 0, min: 0 },
    budget: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    usedAmount: { type: Number, default: 0, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'promotions' }
);

promotionSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
promotionSchema.plugin(searchablePlugin, { getParts: (doc) => [doc.name, doc.campaign, doc.description] });

module.exports = mongoose.model('Promotion', promotionSchema);
