const mongoose = require('mongoose');

// HÓA ĐƠN ĐIỆN TỬ (GIẢ LẬP) theo mô hình Nghị định 123/2020/NĐ-CP + Thông tư 78/2021/TT-BTC:
// mẫu số 1 (HĐ GTGT), ký hiệu C26TTS (C = có mã của cơ quan thuế, 26 = năm, T = doanh nghiệp đăng ký, TS = TechShop),
// số hóa đơn tăng liên tục theo ký hiệu + năm, mã CQT, mã tra cứu, chữ ký số giả lập (HMAC-SHA256).
// KHÔNG gửi lên cơ quan thuế thật - chỉ phục vụ demo / kiểm thử.
const lineSchema = new mongoose.Schema({
  no: Number, name: String, unit: { type: String, default: 'Cái' }, quantity: Number,
  unitPrice: Number,   // đơn giá chưa thuế
  discount: Number,    // chiết khấu (đã bao gồm thuế) của dòng
  amount: Number,      // thành tiền chưa thuế (sau chiết khấu)
  vatRate: Number, vatAmount: Number, total: Number, kind: { type: String, default: 'goods' } // goods | shipping
}, { _id: false });

const partySchema = new mongoose.Schema({
  name: String, companyName: String, taxCode: String, address: String, phone: String, email: String, bankAccount: String
}, { _id: false });

const einvoiceSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderCode: String,
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    template: { type: String, default: '1' },          // mẫu số
    series: { type: String, required: true },          // ký hiệu, VD C26TTS
    number: { type: Number, required: true },          // số hóa đơn
    issuedAt: { type: Date, default: Date.now },
    taxAuthorityCode: String,                          // mã của cơ quan thuế (giả lập)
    lookupCode: { type: String, required: true },      // mã tra cứu cho khách
    seller: partySchema,
    buyer: partySchema,
    lines: [lineSchema],
    currency: { type: String, default: 'VND' },
    paymentMethod: { type: String, default: 'TM/CK' },
    totals: {
      net: Number, vat: Number, total: Number,
      byRate: [{ _id: false, rate: Number, net: Number, vat: Number }]
    },
    amountInWords: String,
    // issued = đã phát hành | cancelled = đã hủy | replaced = bị thay thế bởi hóa đơn khác
    status: { type: String, enum: ['issued', 'cancelled', 'replaced'], default: 'issued' },
    type: { type: String, enum: ['original', 'replacement'], default: 'original' },
    replacesId: { type: mongoose.Schema.Types.ObjectId, ref: 'EInvoice' },   // hóa đơn này thay thế cho
    replacedById: { type: mongoose.Schema.Types.ObjectId, ref: 'EInvoice' }, // bị thay bởi
    cancelReason: String,
    cancelledAt: Date,
    cancelledByName: String,
    signature: String,       // chữ ký số giả lập trên nội dung hóa đơn
    signedAt: Date,
    provider: { type: String, default: 'simulation' }, // nhà cung cấp phát hành: simulation | bkav ...
    providerRef: String,                               // mã hóa đơn bên nhà cung cấp (VD InvoiceGUID của Bkav)
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    issuedByName: String,
    emailedTo: String,
    emailedAt: Date
  },
  { timestamps: true, collection: 'einvoices' }
);

einvoiceSchema.index({ series: 1, number: 1 }, { unique: true });
einvoiceSchema.index({ lookupCode: 1 }, { unique: true });
// Mỗi đơn hàng chỉ có 1 hóa đơn đang hiệu lực
einvoiceSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { status: 'issued' } });
einvoiceSchema.index({ issuedAt: -1 });

module.exports = mongoose.model('EInvoice', einvoiceSchema);
