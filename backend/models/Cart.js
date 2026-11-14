const mongoose = require('mongoose');

// LƯU Ý: Collection "carts" không có trong thiết kế database gốc được cung cấp,
// nhưng vẫn cần thiết cho nghiệp vụ giỏ hàng. Đặt tên field theo đúng quy ước
// của schema gốc (dùng "productId" thay vì "product" để nhất quán).
const cartItemSchema = new mongoose.Schema( // 1 dòng trong giỏ
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, // sản phẩm
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true }, // phiên bản trong Product.variants
    variantLabel: { type: String, default: '' }, // VD: "Đen - 256GB" (lưu sẵn để hiển thị)
    name: String, // tên sản phẩm (lưu sẵn)
    image: String, // ảnh (lưu sẵn)
    unitPrice: { type: Number, required: true }, // đơn giá lúc xem giỏ gần nhất (chỉ để hiển thị)
    quantity: { type: Number, required: true, min: 1, default: 1 } // số lượng, tối thiểu 1
  },
  { _id: true } // mỗi dòng có _id riêng -> sửa / xóa theo /items/:itemId
);

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // unique: mỗi khách 1 giỏ
    items: [cartItemSchema] // danh sách dòng hàng
  },
  { collection: 'carts' } // tên collection trong MongoDB
);

// Trường ảo (không lưu DB): tổng tiền = tổng (đơn giá × số lượng)
cartSchema.virtual('totalAmount').get(function () {
  return this.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
});
cartSchema.set('toJSON', { virtuals: true }); // khi trả JSON cho frontend thì kèm trường ảo
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
