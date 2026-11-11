const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');

async function migrateProductReviews() {
  await Review.init();
  const migrations = mongoose.connection.collection('migrations');
  const id = 'product-reviews-without-hiding-v1';
  if (await migrations.findOne({ _id: id })) return;
  await Review.updateMany({ status: 'hidden' }, { $set: { status: 'visible' } });
  const stats = await Review.aggregate([{ $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  if (stats.length) await Product.bulkWrite(stats.map(s => ({ updateOne: { filter: { _id: s._id }, update: { $set: { ratingAverage: Math.round(s.avg * 10) / 10, ratingCount: s.count } } } })));
  await migrations.updateOne({ _id: id }, { $set: { completedAt: new Date() } }, { upsert: true });
}
module.exports = { migrateProductReviews };
