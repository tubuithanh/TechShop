const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    // Mở rộng thêm để hiển thị nhanh trong lịch sử đơn hàng, không cần populate lại
    name: String,
    image: String
  },
  { _id: false }
);

const deliveryAddressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    // Mở rộng: tên người nhận + SĐT để phù hợp nghiệp vụ giao hàng VN
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    deliveryAddress: deliveryAddressSchema,
    paymentMode: { type: String, enum: ['cod', 'bank_transfer', 'vnpay', 'momo'], required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled', 'returned'],
      default: 'pending'
    },
    items: [orderItemSchema],

    // ----- Mở rộng thêm cho nghiệp vụ đầy đủ (mã đơn, phí ship, giảm giá, lịch sử trạng thái) -----
    orderCode: { type: String, required: true, unique: true },
    deliveryMethod: { type: String, enum: ['home_delivery', 'store_pickup'], default: 'home_delivery' },
    itemsTotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    voucherCode: { type: String, default: null },
    grandTotal: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    statusHistory: [
      {
        status: String,
        note: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId }
      }
    ],
    note: String,
    cancelReason: String
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'orders' }
);

orderSchema.index({ storeId: 1, createdAt: -1 });
orderSchema.index({ userId: 1 });

module.exports = mongoose.model('Order', orderSchema);
