const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

const warrantySchema = new mongoose.Schema(
  {
    ticketCode: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    customerName: String,
    customerPhone: String,
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: String,
    issueDescription: { type: String, required: true },
    returnReason: {
      type: String,
      enum: [
        'loi_nha_san_xuat',
        'hu_hong_van_chuyen',
        'khong_dung_mo_ta',
        'giao_nham_san_pham',
        'thieu_phu_kien',
        'doi_y',
        'khac'
      ],
      default: 'loi_nha_san_xuat'
    },
    // Tình trạng bảo hành TẠI THỜI ĐIỂM TIẾP NHẬN (chụp lại, không đổi về sau):
    //   in_warranty: còn bảo hành tại cửa hàng (miễn phí) | manufacturer: còn bảo hành, do hãng quản lý
    //   out_of_warranty: hết bảo hành -> sửa dịch vụ có tính phí (chỉ nhân viên tạo được)
    coverage: {
      type: { type: String, enum: ['in_warranty', 'manufacturer', 'out_of_warranty'] },
      cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarrantyCard' },
      cardCode: String,
      serial: String,
      endDate: Date,
      totalMonths: Number,
      providerName: String,
      providerPhone: String,
      checkedAt: Date
    },
    warrantyCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarrantyCard', default: null },
    images: [String],
    method: { type: String, enum: ['bring_to_store', 'pickup_at_home', 'send_by_post'], default: 'bring_to_store' },
    status: {
      type: String,
      enum: ['received', 'checking', 'repairing', 'waiting_parts', 'done', 'returned'],
      default: 'received'
    },
    statusHistory: [
      {
        status: String,
        note: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId }
      }
    ],
    cost: { type: Number, default: 0 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    customerRating: { type: Number, min: 1, max: 5 },
    customerFeedback: String
  },
  { timestamps: true, collection: 'warranties' }
);

// Tìm kiếm không dấu: mã phiếu, sản phẩm, mã đơn, người nhận, SĐT (lấy từ đơn hàng)
warrantySchema.plugin(searchablePlugin, {
  getParts: async (doc) => {
    const order =
      doc.orderId?.orderCode !== undefined
        ? doc.orderId
        : doc.orderId
          ? await mongoose.model('Order').findById(doc.orderId).select('orderCode deliveryAddress').lean()
          : null;
    return [
      doc.ticketCode,
      String(doc.ticketCode || '').replace(/^BH/i, ''),
      doc.productName,
      order?.orderCode,
      order?.deliveryAddress?.fullName,
      order?.deliveryAddress?.phone
    ];
  }
});

module.exports = mongoose.model('Warranty', warrantySchema);
