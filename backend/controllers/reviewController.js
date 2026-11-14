// =====================================================================================================
// controllers/reviewController.js - ĐÁNH GIÁ SẢN PHẨM (nhiều tiêu chí, thẻ nhận xét nhanh, ảnh, ẩn danh)
//   Khách: kiểm tra được đánh giá không, viết / sửa đánh giá (chỉ sản phẩm trong đơn ĐÃ GIAO), bấm "Hữu ích"
//   Công khai: danh sách + tổng quan đánh giá của sản phẩm
//   Quản trị: danh sách mọi đánh giá, trả lời đánh giá
// =====================================================================================================
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');
const { CRITERIA, TAGS, MAX_TAGS, parseReviewExtras, maskName } = require('../utils/reviewCriteria'); // tiêu chí, thẻ, che tên

// Đơn ĐÃ GIAO gần nhất của khách có chứa sản phẩm này (bằng chứng "đã mua") - orderId truyền vào thì đúng đơn đó
async function deliveredPurchase(req, productId, orderId) {
  if (orderId && !mongoose.isValidObjectId(orderId)) return null; // id đơn sai định dạng
  return Order.findOne({ userId: req.account._id, status: 'delivered', 'items.productId': productId, ...(orderId ? { _id: orderId } : {}) }).select('_id items').sort({ createdAt: -1 });
}
// Phân loại (màu / dung lượng) khách đã mua trong đơn
const boughtVariant = (purchase, productId) => purchase?.items?.find((i) => String(i.productId) === String(productId))?.variantLabel || '';

// @route GET /api/products/:productId/reviews/eligibility - khách được đánh giá không + đánh giá cũ (nếu có)
const eligibility = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng được đánh giá' });
  if (!mongoose.isValidObjectId(req.params.productId)) return res.status(400).json({ message: 'Sản phẩm không hợp lệ' });
  const purchase = await deliveredPurchase(req, req.params.productId);
  const review = await Review.findOne({ productId: req.params.productId, userId: req.account._id }).sort({ createdAt: -1 });
  res.json({ data: { eligible: !!purchase, orderId: purchase?._id || null, review } }); // eligible = đã nhận hàng
});

// Tính lại điểm sao trung bình + số đánh giá lưu trên sản phẩm (hiển thị nhanh ở danh sách sản phẩm)
async function recomputeProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { productId } },
    { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  await Product.findByIdAndUpdate(productId, {
    ratingAverage: stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0, // làm tròn 1 chữ số thập phân
    ratingCount: stats.length > 0 ? stats[0].count : 0
  });
}

const MAX_REVIEW_IMAGES = 5; // tối đa 5 ảnh mỗi đánh giá
// Ảnh: mảng tối đa 5 đường dẫn http(s)
function validateReviewImages(images) {
  if (images === undefined) return null;
  if (!Array.isArray(images) || images.length > MAX_REVIEW_IMAGES || images.some((u) => typeof u !== 'string' || !/^https?:\/\//.test(u))) {
    return `Ảnh đánh giá không hợp lệ (tối đa ${MAX_REVIEW_IMAGES} ảnh)`;
  }
  return null;
}
// Số sao: số nguyên 1..5
function validateRating(rating) {
  return Number.isInteger(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5 ? null : 'Số sao phải từ 1 đến 5';
}

// Đánh giá ẩn danh: không trả tên thật / ảnh đại diện (chỉ giữ mã tài khoản để chủ đánh giá nhận ra đánh giá của mình)
function publicReview(r) {
  const o = r.toObject ? r.toObject() : r;
  if (o.isAnonymous) {
    const realName = o.userId?.displayName || o.displayName;
    o.displayName = maskName(realName); // "Nguyễn Văn An" -> "N***n"
    o.photoURL = '';
    if (o.userId && typeof o.userId === 'object') o.userId = { _id: o.userId._id }; // bỏ tên + ảnh đã populate
  }
  delete o.helpfulBy; // không lộ danh sách người bấm "Hữu ích"
  delete o.reviewKey; // khóa nội bộ chống trùng
  return o;
}

// Tổng quan: số sao trung bình, phân bố 1-5 sao, điểm trung bình từng tiêu chí, thẻ được chọn nhiều, số đánh giá có ảnh
async function reviewSummary(productId) {
  const match = { productId: new mongoose.Types.ObjectId(String(productId)) }; // aggregate cần ObjectId thật
  const [row] = await Review.aggregate([
    { $match: match },
    {
      $facet: { // chạy 4 phép thống kê song song trên cùng tập đánh giá
        overall: [{ $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 }, withImages: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$images', []] } }, 0] }, 1, 0] } } } }], // trung bình, tổng, số có ảnh
        stars: [{ $group: { _id: '$rating', n: { $sum: 1 } } }], // số đánh giá theo từng mức sao
        // mỗi tiêu chí: điểm trung bình + số người chấm tiêu chí đó
        criteria: [{ $group: { _id: null, ...Object.fromEntries(CRITERIA.flatMap((c) => [[c.key, { $avg: `$criteria.${c.key}` }], [`${c.key}N`, { $sum: { $cond: [{ $gt: [`$criteria.${c.key}`, 0] }, 1, 0] } }]])) } }],
        tags: [{ $unwind: '$tags' }, { $group: { _id: '$tags', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }] // 8 thẻ được chọn nhiều nhất
      }
    }
  ]);
  const o = row.overall[0] || { avg: 0, count: 0, withImages: 0 }; // chưa có đánh giá -> 0
  const c = row.criteria[0] || {};
  return {
    average: Math.round((o.avg || 0) * 10) / 10,
    count: o.count,
    withImages: o.withImages,
    stars: Object.fromEntries([1, 2, 3, 4, 5].map((s) => [s, row.stars.find((x) => x._id === s)?.n || 0])), // đủ 5 mức, thiếu = 0
    criteria: CRITERIA.map((k) => ({ key: k.key, label: k.label, average: c[k.key] ? Math.round(c[k.key] * 10) / 10 : null, count: c[`${k.key}N`] || 0 })),
    tags: row.tags.map((t) => ({ tag: t._id, count: t.n, negative: TAGS.negative.includes(t._id) })) // đánh dấu thẻ chê
  };
}

// @route GET /api/products/:productId/reviews?star=1-5&withImages=true&sort=newest|helpful|highest|lowest&page=&limit=
const getProductReviews = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  // Không lọc theo status: chức năng ẩn đánh giá đã bỏ, đánh giá cũ từng bị ẩn vẫn hiển thị (xem migrateProductReviews)
  const filter = { productId: req.params.productId };
  const star = Number(req.query.star);
  if (Number.isInteger(star) && star >= 1 && star <= 5) filter.rating = star; // lọc theo số sao
  if (req.query.withImages === 'true') filter['images.0'] = { $exists: true }; // chỉ đánh giá có ảnh
  const SORTS = { newest: { createdAt: -1 }, helpful: { helpfulCount: -1, createdAt: -1 }, highest: { rating: -1, createdAt: -1 }, lowest: { rating: 1, createdAt: -1 } };
  const sort = SORTS[req.query.sort] || SORTS.newest; // mặc định mới nhất
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [reviews, total, summary] = await Promise.all([ // 3 truy vấn song song
    Review.find(filter).populate('userId', 'displayName avatar').sort(sort).skip((page - 1) * limit).limit(limit),
    Review.countDocuments(filter),
    reviewSummary(req.params.productId)
  ]);
  res.json({ data: reviews.map(publicReview), total, page, totalPages: Math.max(1, Math.ceil(total / limit)), summary });
});

// @route GET /api/reviews/options - danh sách tiêu chí + thẻ nhận xét nhanh cho form đánh giá
const reviewOptions = (req, res) => res.json({ data: { criteria: CRITERIA, tags: TAGS, maxTags: MAX_TAGS, maxImages: MAX_REVIEW_IMAGES } });

// @route POST /api/products/:productId/reviews/:reviewId/helpful - khách bấm / bỏ "Hữu ích" (không tự bấm cho mình)
const toggleHelpful = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng được bình chọn' });
  if (!mongoose.isValidObjectId(req.params.reviewId)) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  const review = await Review.findOne({ _id: req.params.reviewId, productId: req.params.productId }).select('+helpfulBy userId'); // helpfulBy ẩn mặc định
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  if (String(review.userId) === String(req.account._id)) return res.status(400).json({ message: 'Không thể bình chọn đánh giá của chính mình' });
  const me = req.account._id;
  const helped = review.helpfulBy.some((id) => String(id) === String(me)); // đã bấm trước đó?
  // Cập nhật có điều kiện: bấm 2 lần liên tiếp không cộng 2
  const updated = helped
    ? await Review.findOneAndUpdate({ _id: review._id, helpfulBy: me }, { $pull: { helpfulBy: me }, $inc: { helpfulCount: -1 } }, { new: true }) // bỏ bấm
    : await Review.findOneAndUpdate({ _id: review._id, helpfulBy: { $ne: me } }, { $addToSet: { helpfulBy: me }, $inc: { helpfulCount: 1 } }, { new: true }); // bấm
  res.json({ data: { helped: !helped, helpfulCount: Math.max(0, updated?.helpfulCount ?? review.helpfulCount) } });
});

// @route POST /api/products/:productId/reviews - viết đánh giá
const createReview = asyncHandler(async (req, res) => {
  const { rating, images, orderId } = req.body;
  const productId = req.params.productId;
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng mới đánh giá sản phẩm' });
  if (req.body.message !== undefined && typeof req.body.message !== 'string') {
    return res.status(400).json({ message: 'Nội dung đánh giá không hợp lệ' });
  }
  const message = (req.body.message || '').trim();
  if (message.length > 2000) return res.status(400).json({ message: 'Nội dung đánh giá tối đa 2000 ký tự' });
  const inputError = validateRating(rating) || validateReviewImages(images);
  if (inputError) return res.status(400).json({ message: inputError });
  const extras = parseReviewExtras(req.body); // điểm tiêu chí, thẻ, ẩn danh
  if (extras.error) return res.status(400).json({ message: extras.error });
  if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId }))) {
    return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
  }
  const existingReview = await Review.findOne({ productId, userId: req.account._id }); // mỗi khách 1 đánh giá / sản phẩm
  if (existingReview) {
    return res.status(409).json({ message: 'Bạn đã đánh giá sản phẩm này rồi' });
  }

  const purchase = await deliveredPurchase(req, productId, orderId); // phải đã nhận hàng
  if (!purchase) return res.status(403).json({ message: 'Bạn chỉ được đánh giá sản phẩm trong đơn hàng của mình đã giao thành công' });

  const review = await Review.create({
    productId,
    userId: req.account._id,
    orderId: purchase._id,
    reviewKey: String(req.account._id) + ":" + String(productId), // chỉ số duy nhất: chặn 2 request gửi cùng lúc tạo 2 đánh giá
    displayName: req.account.displayName || req.account.name,
    photoURL: req.account.avatar,
    rating,
    message,
    images,
    ...extras.values,
    variantLabel: boughtVariant(purchase, productId), // "Đã mua: Đen - 256GB"
    isVerifiedPurchase: true // nhãn "Đã mua hàng"
  }).catch(err => {
    if (err.code === 11000) { err.statusCode = 409; err.message = 'Bạn đã đánh giá sản phẩm này rồi'; } // trùng reviewKey
    throw err;
  });

  await recomputeProductRating(review.productId); // cập nhật điểm trung bình sản phẩm

  res.status(201).json({ data: publicReview(review) });
});

// @route PUT /api/products/:productId/reviews/:reviewId - sửa đánh giá của chính mình
const updateReview = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ khách hàng được đánh giá' });
  const review = await Review.findOne({ _id: req.params.reviewId, productId: req.params.productId });
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  if (review.userId.toString() !== req.account._id.toString()) { // chỉ chủ đánh giá
    return res.status(403).json({ message: 'Bạn chỉ được sửa đánh giá của chính mình' });
  }
  const { rating, message, images } = req.body;
  const purchase = await deliveredPurchase(req, req.params.productId); // vẫn phải còn đơn đã giao (đơn trả hàng thì mất quyền sửa)
  if (!purchase) return res.status(403).json({ message: 'Chỉ được sửa đánh giá sản phẩm đã nhận hàng' });
  if (message !== undefined && typeof message !== 'string') return res.status(400).json({ message: 'Nội dung đánh giá không hợp lệ' });
  // Các gán bên dưới chỉ trên bộ nhớ; gặp lỗi phía sau thì không save nên không ảnh hưởng dữ liệu
  review.orderId = purchase._id;
  review.isVerifiedPurchase = true;
  review.status = 'visible';
  const inputError = (rating !== undefined && validateRating(rating)) || validateReviewImages(images);
  if (inputError) return res.status(400).json({ message: inputError });
  if (message !== undefined && String(message).length > 2000) {
    return res.status(400).json({ message: 'Nội dung đánh giá tối đa 2000 ký tự' });
  }

  const extras = parseReviewExtras(req.body, true); // partial: chỉ đổi phần có gửi
  if (extras.error) return res.status(400).json({ message: extras.error });
  Object.assign(review, extras.values);
  review.variantLabel = boughtVariant(purchase, req.params.productId) || review.variantLabel;
  if (rating !== undefined) review.rating = Number(rating);
  if (message !== undefined) review.message = String(message).trim();
  if (images !== undefined) review.images = images;
  review.editedAt = new Date(); // hiển thị "đã chỉnh sửa"
  await review.save();
  await recomputeProductRating(review.productId);

  const populated = await Review.findById(review._id).populate('userId', 'displayName avatar');
  res.json({ data: publicReview(populated) });
});

// @route POST /api/reviews/:id/reply - cửa hàng trả lời đánh giá (ghi đè câu trả lời cũ)
const replyReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content || content.length > 2000) return res.status(400).json({ message: 'Nội dung trả lời từ 1 đến 2000 ký tự' });
  review.reply = { content, repliedAt: new Date(), repliedBy: req.account._id };
  await review.save();
  res.json({ data: review });
});

// @route GET /api/reviews/admin/all - danh sách đánh giá cho quản trị
const getAllReviewsAdmin = asyncHandler(async (req, res) => {
  const { rating, replied, q, page = 1, limit = 20 } = req.query;
  const filter = {};
  // Lọc thêm: có thẻ chê (khiếu nại) / có ảnh / theo sản phẩm
  if (req.query.negative === 'true') filter.tags = { $in: TAGS.negative };
  if (req.query.hasImages === 'true') filter['images.0'] = { $exists: true };
  if (req.query.productId && mongoose.isValidObjectId(req.query.productId)) filter.productId = req.query.productId;
  if (rating && Number(rating) >= 1 && Number(rating) <= 5) filter.rating = Number(rating);
  if (replied === 'true') filter['reply.content'] = { $exists: true, $ne: '' }; // đã trả lời
  if (replied === 'false') filter.$or = [{ 'reply.content': { $exists: false } }, { 'reply.content': '' }]; // chưa trả lời
  Object.assign(filter, searchFilter(q)); // tên khách, nội dung, tên sản phẩm (không dấu)
  const reviews = await Review.find(filter)
    .populate('userId', 'displayName email avatar')
    .populate('productId', 'title slug featuredImage')
    .populate({ path: 'orderId', select: 'orderCode storeId', populate: { path: 'storeId', select: 'name' } }) // đơn + chi nhánh bán
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Review.countDocuments(filter);
  res.json({ data: reviews, total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

module.exports = {
  reviewOptions,
  toggleHelpful,
  reviewSummary, getProductReviews, createReview, updateReview, eligibility, replyReview, getAllReviewsAdmin };
