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

// Ảnh đánh giá: tối đa 3 đường link http(s) (ảnh khách đã tải lên qua /api/uploads) - khớp giao diện
// và Điều khoản sử dụng. Trả về thông báo lỗi, hoặc null nếu hợp lệ.
const MAX_REVIEW_IMAGES = 3;
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
  const reviews = await Review.find({ productId: req.params.productId, status: 'visible' })
    .populate('userId', 'displayName avatar')
    .sort({ createdAt: -1 });
  res.json({ data: reviews });
});

const createReview = asyncHandler(async (req, res) => {
  const { rating, message, images, orderId } = req.body;
  const productId = req.params.productId;
  const inputError = validateRating(rating) || validateReviewImages(images);
  if (inputError) return res.status(400).json({ message: inputError });

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

// @route PUT /api/products/:productId/reviews/:reviewId - khách sửa đánh giá của chính mình (số sao,
// nội dung, hình ảnh). Không cho sửa đánh giá đã bị quản trị viên ẩn - nếu không, khách có thể "lách" việc
// kiểm duyệt bằng cách sửa lại nội dung vi phạm.
const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findOne({ _id: req.params.reviewId, productId: req.params.productId });
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  if (review.userId.toString() !== req.account._id.toString()) {
    return res.status(403).json({ message: 'Bạn chỉ được sửa đánh giá của chính mình' });
  }
  if (review.status !== 'visible') {
    return res.status(403).json({ message: 'Đánh giá đã bị ẩn do vi phạm quy định, không thể chỉnh sửa' });
  }

  const { rating, message, images } = req.body;
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

module.exports = { getProductReviews, createReview, updateReview, hideReview, replyReview, getAllReviewsAdmin };
