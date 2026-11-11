const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');
async function deliveredPurchase(req, productId, orderId) {
  if (orderId && !mongoose.isValidObjectId(orderId)) return null;
  return Order.findOne({ userId: req.account._id, status: 'delivered', 'items.productId': productId, ...(orderId ? { _id: orderId } : {}) }).select('_id').sort({ createdAt: -1 });
}
const eligibility = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng được đánh giá' });
  if (!mongoose.isValidObjectId(req.params.productId)) return res.status(400).json({ message: 'Sản phẩm không hợp lệ' });
  const purchase = await deliveredPurchase(req, req.params.productId);
  const review = await Review.findOne({ productId: req.params.productId, userId: req.account._id }).sort({ createdAt: -1 });
  res.json({ data: { eligible: !!purchase, orderId: purchase?._id || null, review } });
});async function recomputeProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { productId } },
    { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  await Product.findByIdAndUpdate(productId, {
    ratingAverage: stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0,
    ratingCount: stats.length > 0 ? stats[0].count : 0
  });
}const MAX_REVIEW_IMAGES = 3;
function validateReviewImages(images) {
  if (images === undefined) return null;
  if (!Array.isArray(images) || images.length > MAX_REVIEW_IMAGES || images.some((u) => typeof u !== 'string' || !/^https?:\/\//.test(u))) {
    return `Ảnh đánh giá không hợp lệ (tối đa ${MAX_REVIEW_IMAGES} ảnh)`;
  }
  return null;
}
function validateRating(rating) {
  return Number.isInteger(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5 ? null : 'Số sao phải từ 1 đến 5';
}

const getProductReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ productId: req.params.productId })
    .populate('userId', 'displayName avatar')
    .sort({ createdAt: -1 });
  res.json({ data: reviews });
});

const createReview = asyncHandler(async (req, res) => {
  const { rating, images, orderId } = req.body;
  const productId = req.params.productId;  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng mới đánh giá sản phẩm' });
  if (req.body.message !== undefined && typeof req.body.message !== 'string') {
    return res.status(400).json({ message: 'Nội dung đánh giá không hợp lệ' });
  }
  const message = (req.body.message || '').trim();
  if (message.length > 2000) return res.status(400).json({ message: 'Nội dung đánh giá tối đa 2000 ký tự' });
  const inputError = validateRating(rating) || validateReviewImages(images);
  if (inputError) return res.status(400).json({ message: inputError });
  if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId }))) {
    return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  }  const existingReview = await Review.findOne({ productId, userId: req.account._id });
  if (existingReview) {
    return res.status(409).json({ message: 'Bạn đã đánh giá sản phẩm này rồi' });
  }

  const purchase = await deliveredPurchase(req, productId, orderId);
  if (!purchase) return res.status(403).json({ message: 'Bạn chỉ được đánh giá sản phẩm trong đơn hàng của mình đã giao thành công' });

  const review = await Review.create({
    productId,
    userId: req.account._id,
    orderId: purchase._id,
    reviewKey: String(req.account._id) + ":" + String(productId),
    displayName: req.account.displayName || req.account.name,
    photoURL: req.account.avatar,
    rating,
    message,
    images,
    isVerifiedPurchase: true
  }).catch(err => {
    if (err.code === 11000) { err.statusCode = 409; err.message = 'Bạn đã đánh giá sản phẩm này rồi'; }
    throw err;
  });

  await recomputeProductRating(review.productId);

  res.status(201).json({ data: review });
});const updateReview = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng được đánh giá' });
  const review = await Review.findOne({ _id: req.params.reviewId, productId: req.params.productId });
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  if (review.userId.toString() !== req.account._id.toString()) {
    return res.status(403).json({ message: 'Bạn chỉ được sửa đánh giá của chính mình' });
  }
  const { rating, message, images } = req.body;
  const purchase = await deliveredPurchase(req, req.params.productId);
  if (!purchase) return res.status(403).json({ message: 'Chỉ được sửa đánh giá sản phẩm đã nhận hàng' });
  if (message !== undefined && typeof message !== 'string') return res.status(400).json({ message: 'Nội dung đánh giá không hợp lệ' });
  review.orderId = purchase._id;
  review.isVerifiedPurchase = true;
  review.status = 'visible';
  const inputError = (rating !== undefined && validateRating(rating)) || validateReviewImages(images);
  if (inputError) return res.status(400).json({ message: inputError });
  if (message !== undefined && String(message).length > 2000) {
    return res.status(400).json({ message: 'Nội dung đánh giá tối đa 2000 ký tự' });
  }

  if (rating !== undefined) review.rating = Number(rating);
  if (message !== undefined) review.message = String(message).trim();
  if (images !== undefined) review.images = images;
  review.editedAt = new Date();
  await review.save();
  await recomputeProductRating(review.productId);

  const populated = await Review.findById(review._id).populate('userId', 'displayName avatar');
  res.json({ data: populated });
});

const replyReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content || content.length > 2000) return res.status(400).json({ message: 'Nội dung trả lời từ 1 đến 2000 ký tự' });
  review.reply = { content, repliedAt: new Date(), repliedBy: req.account._id };
  await review.save();
  res.json({ data: review });
});

const getAllReviewsAdmin = asyncHandler(async (req, res) => {
  const { rating, replied, q, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (rating && Number(rating) >= 1 && Number(rating) <= 5) filter.rating = Number(rating);
  if (replied === 'true') filter['reply.content'] = { $exists: true, $ne: '' };
  if (replied === 'false') filter.$or = [{ 'reply.content': { $exists: false } }, { 'reply.content': '' }];
  Object.assign(filter, searchFilter(q)); // tên khách, nội dung, tên sản phẩm (không dấu)
  const reviews = await Review.find(filter)
    .populate('userId', 'displayName email avatar')
    .populate('productId', 'title slug featuredImage')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Review.countDocuments(filter);
  res.json({ data: reviews, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

module.exports = { getProductReviews, createReview, updateReview, eligibility, replyReview, getAllReviewsAdmin };
