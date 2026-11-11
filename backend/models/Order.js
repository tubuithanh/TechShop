const mongoose = require('mongoose');
const { searchablePlugin } = require('../utils/search');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Phiên bản đã mua (dùng để hoàn kho đúng phiên bản khi hủy/trả hàng) + nhãn chụp lại tại thời điểm mua
    variantId: { type: mongoose.Schema.Types.ObjectId },
    variantLabel: { type: String, default: '' },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    vat: { type: new mongoose.Schema({ rate:Number,included:Boolean,taxableTotal:Number,netAmount:Number,amount:Number }, { _id:false }), default:undefined },
    discountAmount: Number,
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['online', 'pos'], default: 'online' },
    workflowVersion: { type: Number, default: 2 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    createdByName: { type: String, default: '' },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    confirmedByName: String,
    confirmedAt: Date,
    confirmedStoreName: String,
    activeTransferId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderTransfer', default: null },
    clientRequestId: String,
    requestFingerprint: { type: String, select: false },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    deliveryAddress: deliveryAddressSchema,
    paymentMode: { type: String, enum: ['cod', 'cash', 'bank_transfer', 'vnpay', 'momo'], required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping', 'returning', 'delivered', 'cancelled', 'returned'],
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
    // discountAmount = promotionDiscount (khuyến mãi tự động) + voucherDiscount (mã giảm giá)
    voucherDiscount: { type: Number, default: 0 },
    promotionDiscount: { type: Number, default: 0 },
    promotions: [
      {
        _id: false,
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion' },
        name: String,
        campaign: String,
        amount: Number
      }
    ],
    grandTotal: { type: Number, required: true },
    // Tổng VAT của cả đơn và VAT riêng của phí giao hàng (tính lúc đặt, giữ cố định dù sau này đổi thuế suất).
    // Thiếu 2 trường này trong schema thì Mongoose (strict) âm thầm bỏ đi khi lưu -> hóa đơn không có VAT.
    vat: { type: mongoose.Schema.Types.Mixed, default: undefined },
    shippingVat: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Số điểm thành viên đã cộng cho đơn này khi giao thành công (để trừ lại đúng số đó nếu trả hàng)
    loyaltyPoints: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    // Thông tin giao dịch thanh toán online (VNPay): mã giao dịch lần thử gần nhất + kết quả VNPay trả về
    paymentInfo: {
      txnRef: String,
      // MỌI mã giao dịch đã cấp cho đơn này - khách có thể mở cổng VNPay nhiều lần (thanh toán lại) rồi
      // hoàn tất ở lần cũ; kết quả mang mã cũ vẫn phải tìm ra đúng đơn, nếu không tiền đã trả bị "thất lạc".
      txnRefs: { type: [String], index: true },
      transactionNo: String,
      bankCode: String,
      responseCode: String,
      paidAt: Date,
      // Thời điểm tạo từng lần thử thanh toán (vnp_CreateDate, dạng yyyyMMddHHmmss) - API hoàn tiền VNPay bắt buộc
      // gửi lại đúng giá trị này của giao dịch gốc
      createDates: { type: Map, of: String, default: undefined },
      payDate: String // vnp_PayDate / responseTime cổng thanh toán trả về
    },
    statusHistory: [
      {
        status: String,
        note: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId },
        actorName: String,
        actorRole: String,
        eventType: { type: String, enum: ['status', 'activity'] },
        storeName: String,
        storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
        changes: mongoose.Schema.Types.Mixed
      }
    ],
    note: String,
    // Thông tin xuất hóa đơn điện tử (GTGT) cho doanh nghiệp - khách tích "Xuất hóa đơn công ty" ở trang
    // thanh toán. Không có -> xuất hóa đơn cho người mua cá nhân (tên + địa chỉ nhận hàng).
    invoiceInfo: {
      type: new mongoose.Schema(
        {
          companyName: { type: String, trim: true, maxlength: 200 },
          taxCode: { type: String, trim: true, maxlength: 14 },
          address: { type: String, trim: true, maxlength: 300 },
          email: { type: String, trim: true, lowercase: true, maxlength: 120 }
        },
        { _id: false }
      ),
      default: undefined
    },
    cancelReason: String,
    // ----- Giao nhận hàng (UC37 – UC40) -----
    // Nhân viên giao hàng được phân công (tài khoản quản trị có quyền deliveries.perform)
    shipperId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    assignedAt: Date,
    deliveryPlan: {
      storeId: mongoose.Schema.Types.ObjectId, addressKey: String,
      provinceId: Number, districtId: Number, wardCode: String,
      provinceName: String, districtName: String, wardName: String,
      sameProvince: Boolean, lat: Number, lng: Number,
      distanceMeters: Number, durationSeconds: Number, routingProvider: String, calculatedAt: Date,
      mode: { type: String, enum: ['internal', 'express', 'ghn'] },
      assignmentMode: { type: String, enum: ['manager_choice'] },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, verifiedAt: Date
    },
    shipment: {
      provider: String, environment: String, shopId: Number,
      phase: { type: String, enum: ['creating', 'unknown', 'active', 'cancelled', 'failed'] },
      clientCode: String, code: String, status: String,
      totalFee: Number, codAmount: Number, expectedDeliveryTime: Date,
      createdAt: Date, updatedAt: Date, busyUntil: Date, lease: String,
      request: { type: mongoose.Schema.Types.Mixed, select: false },
      error: String, codSettledAt: Date, codSettlementReference: String,
      events: [{ status: String, at: Date }]
    },
    // Mỗi lần giao: thành công / thất bại kèm lý do
    deliveryAttempts: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        result: { type: String, enum: ['success', 'failed'], required: true },
        reason: { type: String, default: '' },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
      }
    ],
    // Tiền COD: nhân viên giao hàng thu lúc giao thành công, rồi nộp cho chi nhánh (quản lý xác nhận đối soát)
    codCollectedAt: Date,
    codSettledAt: Date,
    codSettledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    handover: {
      recipientName: String, differentRecipient: Boolean, note: String,
      evidenceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryEvidence' }],
      at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
    },
    carrierPickupProof: { evidenceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryEvidence' }], at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' } },
    carrierDeliveryProof: { evidenceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryEvidence' }], at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' } },
    receipt: { amount: Number, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, channel: String },
    returnRequestedAt: Date,
    returnWasDelivered: Boolean,
    returnReceivedAt: Date,
    returnReceivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    // processing: đang gửi lệnh hoàn tiền tới VNPay / MoMo (chặn 2 người bấm hoàn tiền cùng lúc)
    refundStatus: { type: String, enum: ['none', 'pending', 'processing', 'completed'], default: 'none' },
    // Chi tiết hoàn tiền: qua cổng thanh toán (gateway) hay hoàn thủ công (manual), kèm mọi lần thử gọi cổng
    refundInfo: {
      method: { type: String, enum: ['gateway', 'manual'] },
      gateway: String,
      amount: Number,
      requestId: String,
      gatewayTransNo: String,
      note: String,
      attempts: [
        {
          _id: false,
          at: { type: Date, default: Date.now },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
          gateway: String,
          requestId: String,
          ok: Boolean,
          code: String,
          message: String
        }
      ]
    },
    refundedAt: Date,
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'orders' }
);

orderSchema.index({ storeId: 1, createdAt: -1 });
orderSchema.index({ userId: 1 });
orderSchema.index({ userId: 1, status: 1, createdAt: -1, _id: -1 });
orderSchema.index({ userId: 1, createdAt: -1, _id: -1 });
orderSchema.index({ shipperId: 1, status: 1 });
orderSchema.index({ 'shipment.code': 1 }, { unique: true, partialFilterExpression: { 'shipment.environment': 'simulation', 'shipment.code': { $type: 'string' } } });
orderSchema.index({ createdBy: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });

// Tìm kiếm không dấu: mã đơn (cả phần số, VD "000123"), người nhận, SĐT, sản phẩm, mã giảm giá
orderSchema.plugin(searchablePlugin, {
  getParts: (doc) => [
    doc.orderCode,
    String(doc.orderCode || '').replace(/^DH/i, ''),
    doc.deliveryAddress?.fullName,
    doc.deliveryAddress?.phone,
    (doc.items || []).map((i) => [i.name, i.variantLabel]),
    doc.voucherCode
  ]
});

module.exports = mongoose.model('Order', orderSchema);
// Cổng thanh toán online: đơn phải thanh toán xong mới được xử lý tiếp; quá hạn chưa thanh toán thì tự hủy
module.exports.ONLINE_PAYMENT_MODES = ['vnpay', 'momo'];
module.exports.PAYMENT_LABELS = { cod: 'COD', vnpay: 'VNPay', momo: 'MoMo', bank_transfer: 'Chuyển khoản' };
