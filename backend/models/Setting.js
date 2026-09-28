const mongoose = require('mongoose');
const { themeSchemaDefinition } = require('../utils/themes');
const { footerSchemaDefinition } = require('../utils/footer');

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

    // Số ngày lưu nhật ký thao tác: 0 = không ghi nhật ký; N = chỉ giữ N ngày gần nhất (cũ hơn tự xóa)
    auditLogRetentionDays: { type: Number, default: 30, min: 0, max: 3650 },

    // Chống lạm dụng & tấn công dồn dập (giới hạn tần suất gọi API) - chỉ admin xem/đổi qua /api/settings/security,
    // KHÔNG trả về ở GET /api/settings công khai
    rateLimitEnabled: { type: Boolean, default: true, select: false },
    // Số lần tối đa mỗi IP / 15 phút cho từng nhóm (trống = mặc định trong middlewares/rateLimits.js)
    rateLimits: { type: mongoose.Schema.Types.Mixed, default: undefined, select: false },

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      default: 'Website đang được bảo trì để nâng cấp trải nghiệm. Vui lòng quay lại sau ít phút.'
    },

    seo: {
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' }
    },

    // Bộ màu giao diện đang dùng (Cấu hình hệ thống -> Màu sắc giao diện)
    theme: themeSchemaDefinition,

    // Nội dung chân trang (Cấu hình hệ thống -> Chân trang)
    footer: footerSchemaDefinition
  },
  { timestamps: true, collection: 'settings' }
);

module.exports = mongoose.model('Setting', settingSchema);
