const mongoose = require('mongoose');

// Cấu hình giao hàng (Admin -> Cấu hình hệ thống -> Đơn vị giao hàng). Chỉ có 1 bản ghi.
//   mode = 'env':    đọc biến môi trường SHIPPING_PROVIDER / GHN_* như trước (mặc định, tương thích cách cũ)
//   mode = 'custom': dùng cấu hình admin nhập ở đây
// providers: cấu hình RIÊNG của từng đơn vị giao hàng, theo id trong utils/shippingProviders.js. Mỗi đơn vị tự
// khai báo các trường của mình (VD GHN: token + Shop ID theo chi nhánh) - thêm đơn vị mới không cần sửa schema.
// Trường bí mật lưu dạng mã hóa với hậu tố "Enc" (VD tokenEnc), không bao giờ trả về trình duyệt.
const shippingConfigSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['env', 'custom'], default: 'env' },
    activeProvider: { type: String, default: 'simulation' },
    providers: { type: mongoose.Schema.Types.Mixed, default: {} },
    routingApiUrl: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'shipping_configs', minimize: false }
);

module.exports = mongoose.model('ShippingConfig', shippingConfigSchema);
