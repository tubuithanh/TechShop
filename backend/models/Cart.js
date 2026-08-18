const mongoose = require('mongoose');

// LƯU Ý: Collection "carts" không có trong thiết kế database gốc được cung cấp,
// nhưng vẫn cần thiết cho nghiệp vụ giỏ hàng. Đặt tên field theo đúng quy ước
// của schema gốc (dùng "productId" thay vì "product" để nhất quán).
const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    image: String,
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 }
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItemSchema]
  },
  { collection: 'carts' }
);

cartSchema.virtual('totalAmount').get(function () {
  return this.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
});
cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
