/**
 * Script một lần: tính lại field "effectivePrice" cho các Product đã tồn tại trong database
 * trước khi field này được thêm vào schema (backend/models/Product.js). Cần chạy 1 LẦN sau khi
 * deploy code có thêm effectivePrice, để lọc/sắp xếp theo giá trên trang danh sách sản phẩm hoạt
 * động đúng cho dữ liệu cũ (sản phẩm tạo mới sau này đã tự có effectivePrice qua hook pre('validate')).
 * Chạy: node seed/backfillEffectivePrice.js
 * Chạy trên Atlas (production): MONGO_URI="<atlas-connection-string>" node seed/backfillEffectivePrice.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.name);

  const products = await Product.find({}, '_id price salePrice');
  console.log(`Tìm thấy ${products.length} sản phẩm, đang tính lại effectivePrice...`);

  let updated = 0;
  let fixedInvalidSalePrice = 0;
  for (const p of products) {
    let { price, salePrice } = p;
    // Dữ liệu cũ có thể có salePrice > price (chưa từng bị chặn trước khi có validator mới) -
    // coi như không có khuyến mãi hợp lệ, dùng giá gốc.
    if (salePrice != null && salePrice > price) {
      salePrice = undefined;
      fixedInvalidSalePrice++;
    }
    const effectivePrice = salePrice != null && salePrice >= 0 ? salePrice : price;
    await Product.updateOne({ _id: p._id }, { $set: { effectivePrice, salePrice } });
    updated++;
  }

  console.log(`Hoàn tất: đã cập nhật ${updated}/${products.length} sản phẩm.`);
  if (fixedInvalidSalePrice > 0) {
    console.log(`Lưu ý: ${fixedInvalidSalePrice} sản phẩm có salePrice > price (dữ liệu cũ không hợp lệ) đã được bỏ salePrice.`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillEffectivePrice:', err);
  process.exit(1);
});
