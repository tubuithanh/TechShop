const mongoose = require('mongoose');

// Tồn kho theo từng cửa hàng - mô hình multi-store thực sự (mỗi cửa hàng
// có số lượng tồn riêng cho từng sản phẩm, thay vì 1 field "stock" chung)
const storeInventorySchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    stock: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { collection: 'store_inventories' }
);

// Đảm bảo mỗi cặp (cửa hàng, sản phẩm) chỉ có 1 bản ghi tồn kho duy nhất
storeInventorySchema.index({ storeId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('StoreInventory', storeInventorySchema);
