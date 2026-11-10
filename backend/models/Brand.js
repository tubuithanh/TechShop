const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, default: '' },
    // Trung tâm bảo hành của hãng - dùng cho sản phẩm "bảo hành do hãng quản lý"
    warrantyCenter: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      website: { type: String, default: '' },
      address: { type: String, default: '' },
      lookupUrl: { type: String, default: '' } // trang tra cứu bảo hành của hãng (VD: checkcoverage.apple.com)
    }
  },
  { collection: 'brands' }
);

module.exports = mongoose.model('Brand', brandSchema);
