const POSITIVE_COMMENTS = [
  'Sản phẩm rất tốt, đúng như mô tả, giao hàng nhanh.',
  'Chất lượng vượt mong đợi, sẽ ủng hộ shop dài dài.',
  'Đóng gói cẩn thận, hàng chính hãng, rất hài lòng.',
  'Dùng rất mượt, pin trâu, đáng đồng tiền bát gạo.',
  'Nhân viên tư vấn nhiệt tình, sản phẩm đúng như quảng cáo.',
  'Thiết kế đẹp, cầm chắc tay, hiệu năng ổn định.',
  'Mua lần 2 rồi, chất lượng vẫn luôn ổn định.'
];
const NEUTRAL_COMMENTS = [
  'Sản phẩm ổn, tạm chấp nhận được so với giá tiền.',
  'Giao hàng hơi chậm nhưng sản phẩm dùng tốt.',
  'Bình thường, không có gì đặc biệt.',
  'Sản phẩm đúng mô tả nhưng đóng gói hơi sơ sài.'
];
const NEGATIVE_COMMENTS = [
  'Sản phẩm không như kỳ vọng, hơi thất vọng.',
  'Giao hàng chậm, hộp bị móp khi nhận.',
  'Chất lượng chưa tương xứng với giá tiền.',
  'Gặp lỗi nhỏ khi sử dụng, đang liên hệ bảo hành.'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(daysBack = 100) {
  return new Date(Date.now() - randInt(0, daysBack) * 86400000 - randInt(0, 86400000));
}

// Trọng số thiên về đánh giá tích cực, giống phân bố đánh giá thực tế trên các sàn TMĐT
const RATING_WEIGHTED = [5, 5, 5, 5, 4, 4, 4, 3, 2, 1];

function generateReviews(count, { customers, products }) {
  const reviews = [];
  for (let i = 0; i < count; i++) {
    const customer = pick(customers);
    const product = pick(products);
    const rating = pick(RATING_WEIGHTED);
    const message = rating >= 4 ? pick(POSITIVE_COMMENTS) : rating === 3 ? pick(NEUTRAL_COMMENTS) : pick(NEGATIVE_COMMENTS);

    reviews.push({
      userId: customer._id,
      productId: product._id,
      displayName: customer.displayName,
      photoURL: '',
      message,
      rating,
      images: [],
      isVerifiedPurchase: Math.random() < 0.7,
      status: Math.random() < 0.05 ? 'hidden' : 'visible',
      createdAt: randomPastDate()
    });
  }
  return reviews;
}

module.exports = { generateReviews };
