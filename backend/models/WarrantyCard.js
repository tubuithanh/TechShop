const mongoose = require('mongoose');

// Sổ bảo hành điện tử - mỗi MÁY bán ra (mỗi đơn vị sản phẩm của đơn đã giao) có 1 sổ.
// Khác "phiếu bảo hành" (models/Warranty.js) là phiếu tiếp nhận mỗi lần khách mang máy đi sửa.
//   - Thời hạn = baseMonths (theo sản phẩm, mặc định 12 tháng) + các gói gia hạn ĐÃ THANH TOÁN
//   - Tính từ ngày mua (purchaseDate = ngày giao thành công) hoặc ngày kích hoạt (activatedAt) nếu sản phẩm
//     bảo hành "tính từ ngày kích hoạt" và khách kích hoạt trong hạn activationDeadline
//   - provider = 'manufacturer': bảo hành do hãng quản lý, lưu sẵn thông tin trung tâm bảo hành của hãng
const extensionSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarrantyPlan' },
    planName: String,
    months: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    // pending: khách đã đăng ký, chờ thanh toán; paid: đã thu tiền -> được cộng thời hạn; cancelled: đã hủy
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
    channel: { type: String, enum: ['store', 'bank_transfer', 'cash'], default: 'store' },
    requestedAt: { type: Date, default: Date.now },
    requestedBy: { type: mongoose.Schema.Types.ObjectId },
    paidAt: Date,
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    note: String
  },
  { _id: true }
);

const providerInfoSchema = new mongoose.Schema(
  { name: String, phone: String, website: String, address: String, lookupUrl: String },
  { _id: false }
);

const warrantyCardSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // mã sổ bảo hành, VD "SBH2611ABC123"
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderCode: String,
    unitIndex: { type: Number, default: 0 }, // máy thứ mấy của dòng hàng (mua 2 máy -> 2 sổ)
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId },
    productName: String,
    variantLabel: String,
    unitPrice: Number,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    customerName: String,
    customerPhone: String,
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    serial: { type: String, trim: true, default: '' }, // số serial / IMEI do nhân viên nhập khi bàn giao

    provider: { type: String, enum: ['store', 'manufacturer'], default: 'store' },
    providerInfo: { type: providerInfoSchema, default: undefined },

    purchaseDate: { type: Date, required: true },
    startFrom: { type: String, enum: ['purchase', 'activation'], default: 'purchase' },
    activatedAt: Date,
    activationDeadline: Date,
    baseMonths: { type: Number, required: true, min: 0 },
    extensions: [extensionSchema],

    // void: sổ không còn hiệu lực (đơn bị trả hàng)
    status: { type: String, enum: ['active', 'void'], default: 'active' },
    voidReason: String
  },
  { timestamps: true, collection: 'warranty_cards' }
);

warrantyCardSchema.index({ orderId: 1, productId: 1 });
warrantyCardSchema.index({ userId: 1 });
warrantyCardSchema.index({ serial: 1 });
warrantyCardSchema.index({ customerPhone: 1 });

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

// Trạng thái tính tại thời điểm `now` - dùng chung cho API khách, quản trị và kiểm tra khi tạo phiếu sửa chữa
warrantyCardSchema.methods.summary = function (now = new Date()) {
  const paid = (this.extensions || []).filter((e) => e.status === 'paid');
  const extendedMonths = paid.reduce((s, e) => s + e.months, 0);
  const startDate = this.activatedAt || this.purchaseDate;
  const totalMonths = this.baseMonths + extendedMonths;
  const endDate = addMonths(startDate, totalMonths);
  const canActivate = this.status === 'active' && this.startFrom === 'activation' && !this.activatedAt
    && this.activationDeadline && now <= this.activationDeadline;
  let state;
  if (this.status === 'void') state = 'void';
  else if (totalMonths <= 0) state = 'no_warranty';
  else if (now > endDate) state = 'expired';
  else state = canActivate ? 'pending_activation' : 'active';
  return {
    startDate,
    endDate,
    baseMonths: this.baseMonths,
    extendedMonths,
    totalMonths,
    state,
    inWarranty: state === 'active' || state === 'pending_activation',
    daysLeft: Math.max(0, Math.ceil((endDate - now) / 86400000)),
    canActivate: Boolean(canActivate)
  };
};

module.exports = mongoose.model('WarrantyCard', warrantyCardSchema);
