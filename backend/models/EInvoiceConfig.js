const mongoose = require('mongoose');

// Cấu hình HÓA ĐƠN ĐIỆN TỬ (Admin -> Cấu hình hệ thống -> Hóa đơn điện tử). Chỉ có 1 bản ghi.
//   activeProvider: nhà cung cấp đang dùng - 'simulation' (giả lập, mặc định) | 'bkav' | ... (utils/einvoiceProviders.js)
//   providers: cấu hình riêng của từng nhà cung cấp { [id]: { values: {...}, <secret>Enc: '...' } }
//   Trường bí mật lưu mã hóa (hậu tố Enc), không bao giờ trả về trình duyệt.
const einvoiceConfigSchema = new mongoose.Schema(
  {
    activeProvider: { type: String, default: 'simulation' },
    seller: {
      companyName: { type: String, trim: true, default: '' },
      taxCode: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      bankAccount: { type: String, trim: true, default: '' }
    },
    template: { type: String, trim: true, default: '1' },  // mẫu số (1 = HĐ GTGT)
    series: { type: String, trim: true, default: '' },     // ký hiệu, trống = C<yy>TTS
    autoIssue: { type: Boolean, default: false },           // tự xuất khi đơn giao thành công
    autoEmail: { type: Boolean, default: true },            // tự gửi email hóa đơn cho người mua
    providers: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true, collection: 'einvoice_configs', minimize: false }
);

module.exports = mongoose.model('EInvoiceConfig', einvoiceConfigSchema);
