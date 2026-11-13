const mongoose = require('mongoose');

// KHUNG GIỜ GIAO HỎA TỐC: quản lý chi nhánh mở 1 khung giờ trong ngày, chọn danh sách sản phẩm được giao hỏa tốc
// trong bán kính xác định (tối đa 20 km). Khách đặt đúng sản phẩm, trong bán kính, trong khung giờ -> shipper của
// chi nhánh được phân công NGAY và phải giao trong slaMinutes (mặc định 120 phút).
const expressWindowSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    title: { type: String, trim: true, maxlength: 120, default: 'Giao hỏa tốc 2 giờ' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    radiusKm: { type: Number, min: 1, max: 20, default: 10 },
    fee: { type: Number, min: 0, default: 30000 }, // phụ phí hỏa tốc cộng vào phí ship
    slaMinutes: { type: Number, min: 30, max: 240, default: 120 },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    maxOrders: { type: Number, min: 0, default: 0 }, // 0 = không giới hạn (theo số shipper đang có)
    ordersCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    createdByName: String
  },
  { timestamps: true, collection: 'express_windows' }
);

expressWindowSchema.index({ storeId: 1, endAt: -1 });
expressWindowSchema.index({ isActive: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model('ExpressWindow', expressWindowSchema);
