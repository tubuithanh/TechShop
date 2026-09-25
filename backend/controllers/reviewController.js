const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');

// Dùng chung cho createReview và hideReview - trước đây chỉ createReview tính lại điểm trung bình,
// nên ẩn 1 đánh giá không cập nhật lại ratingAverage/ratingCount, để lại số liệu sai vĩnh viễn.
async function recomputeProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { productId, status: 'visible' } },
    { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  await Product.findByIdAndUpdate(productId, {
    ratingAverage: stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0,
    ratingCount: stats.length > 0 ? stats[0].count : 0
  });
}

const getProductReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ productId: req.params.productId, status: 'visible' })
    .populate('userId', 'displayName avatar')
    .sort({ createdAt: -1 });
  res.json({ data: reviews });
});

const createReview = asyncHandler(async (req, res) => {
  const { rating, message, images, orderId } = req.body;
  const productId = req.params.productId;

  // Mỗi khách chỉ được đánh giá 1 lần cho 1 sản phẩm - trước đây không kiểm tra, 1 khách có thể gửi
  // nhiều đánh giá liên tiếp cho cùng sản phẩm, làm sai lệch điểm trung bình (tính trùng nhiều lần
  // ý kiến của cùng 1 người). CHỈ chặn nếu đánh giá cũ còn "visible" - nếu đánh giá trước đó đã bị
  // admin ẩn (spam/vi phạm), khách vẫn cần được phép gửi lại 1 đánh giá khác, không nên bị khoá
  // vĩnh viễn vì không có luồng "gỡ ẩn"/sửa đánh giá cũ nào khác trong hệ thống.
  const existingReview = await Review.findOne({ productId, userId: req.account._id, status: 'visible' });
  if (existingReview) {
    return res.status(409).json({ message: 'Bạn đã đánh giá sản phẩm này rồi' });
  }

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

  await recomputeProductRating(review.productId);

  res.status(201).json({ data: review });
});

const hideReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  review.status = 'hidden';
  await review.save();
  await recomputeProductRating(review.productId);
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
