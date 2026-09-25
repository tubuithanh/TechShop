/**
 * Bổ sung đánh giá mẫu KÈM ẢNH cho dữ liệu đang có (không xóa gì): mỗi sản phẩm được thêm đủ để có ít
 * nhất 10 đánh giá có ảnh, mỗi đánh giá của 1 khách chưa từng đánh giá sản phẩm đó. Sau đó tính lại
 * ratingAverage/ratingCount theo đánh giá đang hiển thị. Chạy lại nhiều lần an toàn (đã đủ thì bỏ qua).
 *
 * Chạy:        node seed/seedProductReviews.js
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/seedProductReviews.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');
const User = require('../models/User');
const { generateProductReviews } = require('./generateReviews');

const TARGET = 10;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.db.databaseName);

  const customers = await User.find({}, '_id displayName').lean();
  const products = await Product.find({}, 'imageURLs variants').lean();
  const withPhotos = await Review.aggregate([
    { $match: { 'images.0': { $exists: true } } },
    { $group: { _id: '$productId', n: { $sum: 1 } } }
  ]);
  const photoCount = new Map(withPhotos.map((r) => [String(r._id), r.n]));
  const reviewers = await Review.aggregate([{ $group: { _id: '$productId', users: { $addToSet: '$userId' } } }]);
  const reviewedBy = new Map(reviewers.map((r) => [String(r._id), new Set(r.users.map(String))]));

  let docs = [];
  let inserted = 0;
  for (const p of products) {
    const need = TARGET - (photoCount.get(String(p._id)) || 0);
    if (need <= 0) continue;
    const already = reviewedBy.get(String(p._id)) || new Set();
    const pool = customers.filter((c) => !already.has(String(c._id)));
    docs.push(...generateProductReviews(p, pool, need));
    if (docs.length >= 2000) {
      inserted += (await Review.insertMany(docs)).length;
      docs = [];
    }
  }
  if (docs.length) inserted += (await Review.insertMany(docs)).length;
  console.log(`Đã thêm ${inserted} đánh giá kèm ảnh`);

  // Tính lại điểm đánh giá cho mọi sản phẩm theo đánh giá đang hiển thị
  const stats = await Review.aggregate([
    { $match: { status: 'visible' } },
    { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const statMap = new Map(stats.map((s) => [String(s._id), s]));
  await Product.bulkWrite(
    products.map((p) => {
      const s = statMap.get(String(p._id));
      return {
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { ratingAverage: s ? Math.round(s.avg * 10) / 10 : 0, ratingCount: s ? s.count : 0 } }
        }
      };
    })
  );
  console.log(`Đã tính lại điểm đánh giá cho ${products.length} sản phẩm`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy seedProductReviews:', err);
  process.exit(1);
});
