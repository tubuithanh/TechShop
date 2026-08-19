const mongoose = require('mongoose');

// Cấu hình chung của toàn hệ thống - CHỈ có 1 document duy nhất trong collection này
// (dùng mẫu "singleton document" vì đây là cấu hình toàn cục, không phải danh sách nhiều bản ghi).
const settingSchema = new mongoose.Schema(
  {
    siteName: { type: String, default: 'TechShop' },
    tagline: { type: String, default: 'Website thương mại điện tử đa chi nhánh' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },

    hotline: { type: String, default: '1900 0000' },
    contactEmail: { type: String, default: 'support@techshop.demo' },
    contactAddress: { type: String, default: '' },
    socialLinks: {
      facebook: { type: String, default: '' },
      zalo: { type: String, default: '' },
      youtube: { type: String, default: '' },
      instagram: { type: String, default: '' }
    },

    productsPerPage: { type: Number, default: 20, min: 4, max: 100 },
    maxImagesPerProduct: { type: Number, default: 10, min: 1, max: 20 },

    defaultShippingFee: { type: Number, default: 30000, min: 0 },
    freeShippingThreshold: { type: Number, default: 0, min: 0 }, // 0 = tắt tính năng miễn phí ship

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      default: 'Website đang được bảo trì để nâng cấp trải nghiệm. Vui lòng quay lại sau ít phút.'
    },

    seo: {
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' }
    }
  },
  { timestamps: true, collection: 'settings' }
);

module.exports = mongoose.model('Setting', settingSchema);
