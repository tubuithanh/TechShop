/**
 * Tạo trường tìm kiếm không dấu (searchTokens) cho dữ liệu ĐANG CÓ - dữ liệu mới tự có khi lưu (xem
 * utils/search.js). Không xóa hay sửa dữ liệu nào khác; chạy lại nhiều lần an toàn (tính lại toàn bộ).
 * Chạy lại script này sau khi đổi các trường được tìm kiếm của một model.
 *
 * Chạy:        node seed/backfillSearchTokens.js [--only=Product,Order]
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/backfillSearchTokens.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');
const Review = require('../models/Review');
const Voucher = require('../models/Voucher');
const Post = require('../models/Post');
require('../models/Brand');
require('../models/Category');

// populate: nạp sẵn bản ghi liên quan cho cả lô, tránh mỗi bản ghi phải truy vấn riêng
const TARGETS = [
  { Model: Product, populate: [{ path: 'brandId', select: 'name' }, { path: 'categoryId', select: 'name' }] },
  { Model: User },
  { Model: Order },
  { Model: Warranty, populate: { path: 'orderId', select: 'orderCode deliveryAddress' } },
  { Model: Review, populate: { path: 'productId', select: 'title' } },
  { Model: Voucher },
  { Model: Post }
];
const BATCH = 500;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.db.databaseName);

  // --only=Product,Order: chỉ cập nhật các model được liệt kê (VD sau khi đổi trường tìm kiếm của sản phẩm)
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice(7).split(',') : null;
  for (const { Model, populate } of TARGETS.filter((t) => !only || only.includes(t.Model.modelName))) {
    await Model.createIndexes(); // chỉ TẠO index còn thiếu (searchTokens), không xóa index nào đang có
    const total = await Model.countDocuments();
    let done = 0;
    for (let skip = 0; skip < total; skip += BATCH) {
      let query = Model.find().sort({ _id: 1 }).skip(skip).limit(BATCH);
      if (populate) query = query.populate(populate);
      const docs = await query;
      const ops = [];
      for (const doc of docs) {
        ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { searchTokens: await Model.computeSearchTokens(doc) } } } });
      }
      if (ops.length) await Model.bulkWrite(ops, { ordered: false });
      done += docs.length;
    }
    console.log(`- ${Model.modelName}: đã cập nhật ${done}/${total} bản ghi`);
  }
  await mongoose.disconnect();
  console.log('Hoàn tất.');
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillSearchTokens:', err);
  process.exit(1);
});
