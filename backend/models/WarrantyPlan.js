const mongoose = require('mongoose');

// Gói bảo hành mở rộng khách có thể mua thêm (VD: "+12 tháng", giá 5% giá máy, tối thiểu 300.000đ).
// Giá = max(minPrice, round(unitPrice × pricePercent / 100)) + fixedPrice.
const warrantyPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    months: { type: Number, required: true, min: 1, max: 60 },
    pricePercent: { type: Number, default: 0, min: 0, max: 100 },
    fixedPrice: { type: Number, default: 0, min: 0 },
    minPrice: { type: Number, default: 0, min: 0 },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }], // trống = mọi danh mục
    // Chỉ bán khi sổ bảo hành còn hiệu lực (không bán cho máy đã hết bảo hành, chưa kiểm tra tình trạng)
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'warranty_plans' }
);

warrantyPlanSchema.methods.priceFor = function (unitPrice) {
  const byPercent = Math.round(((Number(unitPrice) || 0) * this.pricePercent) / 100);
  return Math.max(this.minPrice || 0, byPercent) + (this.fixedPrice || 0);
};

module.exports = mongoose.model('WarrantyPlan', warrantyPlanSchema);
