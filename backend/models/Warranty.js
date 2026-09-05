const mongoose = require('mongoose');

const warrantySchema = new mongoose.Schema(
  {
    ticketCode: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

module.exports = mongoose.model('Warranty', warrantySchema);
