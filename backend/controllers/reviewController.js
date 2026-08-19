const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');

const getProductReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ productId: req.params.productId, status: 'visible' })
    .populate('userId', 'displayName avatar')
    .sort({ createdAt: -1 });
  res.json({ data: reviews });
});

const createReview = asyncHandler(async (req, res) => {
  const { rating, message, images, orderId } = req.body;
  const productId = req.params.productId;

  let isVerifiedPurchase = false;
  if (orderId) {
    const order = await Order.findOne({
      _id: orderId,
      userId: req.account._id,
      status: 'delivered',
      'items.productId': productId
    });
    isVerifiedPurchase = !!order;
  }

  const review = await Review.create({
    productId,
    userId: req.account._id,
    orderId: orderId || null,
    displayName: req.account.displayName || req.account.name,
    photoURL: req.account.avatar,
    rating,
    message,
    images,
    isVerifiedPurchase
  });

  const stats = await Review.aggregate([
    { $match: { productId: review.productId, status: 'visible' } },
    { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratingAverage: Math.round(stats[0].avgRating * 10) / 10,
      ratingCount: stats[0].count
    });
  }

  res.status(201).json({ data: review });
});

const hideReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  review.status = 'hidden';
  await review.save();
  res.json({ message: 'Đã ẩn đánh giá' });
});

const replyReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  review.reply = { content: req.body.content, repliedAt: new Date(), repliedBy: req.account._id };
  await review.save();
  res.json({ data: review });
});

const getAllReviewsAdmin = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = status ? { status } : {};
  const reviews = await Review.find(filter)
    .populate('userId', 'displayName email')
    .populate('productId', 'title slug')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Review.countDocuments(filter);
  res.json({ data: reviews, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

module.exports = { getProductReviews, createReview, hideReview, replyReview, getAllReviewsAdmin };
