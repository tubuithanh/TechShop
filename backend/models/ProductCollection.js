const mongoose = require('mongoose');

// "Collection" ở đây là bộ sưu tập sản phẩm (VD: "Deal hot cuối tuần", "iPhone chính hãng"),
// KHÁC với khái niệm "MongoDB collection" - đây là 1 collection dữ liệu tên "collections"
// chứa các document đại diện cho từng bộ sưu tập sản phẩm.
const productCollectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subTitle: { type: String, default: '' },
    image: { type: String, default: '' },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
  },
  { collection: 'collections' }
);

module.exports = mongoose.model('ProductCollection', productCollectionSchema);
