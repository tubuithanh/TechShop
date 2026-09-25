const mongoose = require('mongoose');

// Tồn kho theo từng cửa hàng - mô hình multi-store thực sự (mỗi cửa hàng
// có số lượng tồn riêng cho từng sản phẩm, thay vì 1 field "stock" chung)
const storeInventorySchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Phiên bản (màu/dung lượng) - _id của 1 phần tử trong Product.variants. Tồn kho tính riêng theo
    // từng phiên bản tại từng cửa hàng.
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    stock: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { collection: 'store_inventories' }
);

// Mỗi (cửa hàng, sản phẩm, phiên bản) chỉ có 1 bản ghi tồn kho. Index cũ { storeId, productId } (trước
// khi có phiên bản) phải được XÓA khỏi database - xem seed/migrateVariants.js - nếu không, không thể có 2
// phiên bản của cùng 1 sản phẩm tại cùng 1 cửa hàng.
storeInventorySchema.index({ storeId: 1, productId: 1, variantId: 1 }, { unique: true });

module.exports = mongoose.model('StoreInventory', storeInventorySchema);
