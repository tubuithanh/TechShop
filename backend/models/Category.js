const mongoose = require('mongoose');

// Mẫu thông số kỹ thuật của danh mục: các nhóm (Màn hình, Hiệu năng...) và trường trong mỗi nhóm.
// Trang chi tiết/so sánh sản phẩm dùng mẫu này để hiển thị thông số theo nhóm và đúng thứ tự; form
// quản trị dùng để hiện sẵn đúng các ô cần nhập cho danh mục đó. Xem utils/specTemplates.js.
const specFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    hint: { type: String, default: '' }
  },
  { _id: false }
);

const specGroupSchema = new mongoose.Schema(
  {
    group: { type: String, required: true },
    fields: [specFieldSchema]
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    slug: { type: String, required: true, unique: true },
    specTemplate: { type: [specGroupSchema], default: [] }
  },
  { collection: 'categories' }
);

module.exports = mongoose.model('Category', categorySchema);
