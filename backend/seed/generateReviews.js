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

// Câu mở đầu nhắc đúng phiên bản khách đã mua - để đánh giá trông như của người mua thật
const VARIANT_OPENERS = ['Mình mua bản {v}.', 'Đã nhận bản {v}.', 'Chọn bản {v},', 'Lấy bản {v} làm quà.', 'Bản {v} ngoài đời đẹp hơn ảnh.'];
const PHOTO_NOTES = ['Gửi vài ảnh thực tế cho mọi người tham khảo.', 'Ảnh chụp lúc vừa mở hộp.', 'Up ảnh thật, không chỉnh sửa.', ''];

// Lấy ngẫu nhiên k phần tử khác nhau
function sample(arr, k) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(k, arr.length));
}

// `count` đánh giá cho ĐÚNG 1 sản phẩm, mỗi đánh giá của 1 khách khác nhau (khớp quy tắc "1 khách chỉ
// đánh giá 1 lần/sản phẩm") và kèm 1-3 ảnh lấy từ bộ ảnh của chính sản phẩm/phiên bản đó.
function generateProductReviews(product, customers, count = 10) {
  const photos = [...new Set([...(product.imageURLs || []), ...(product.variants || []).map((v) => v.image)].filter(Boolean))];
  const variants = (product.variants || []).filter((v) => v.isActive !== false);
  return sample(customers, count).map((customer) => {
    const rating = pick(RATING_WEIGHTED);
    const base = rating >= 4 ? pick(POSITIVE_COMMENTS) : rating === 3 ? pick(NEUTRAL_COMMENTS) : pick(NEGATIVE_COMMENTS);
    const variant = variants.length ? pick(variants) : null;
    const variantLabel = variant ? (variant.storage ? `${variant.color} - ${variant.storage}` : variant.color) : '';
    const opener = variantLabel ? pick(VARIANT_OPENERS).replace('{v}', variantLabel) + ' ' : '';
    return {
      userId: customer._id,
      productId: product._id,
      displayName: customer.displayName,
      photoURL: '',
      message: `${opener}${base} ${pick(PHOTO_NOTES)}`.trim(),
      rating,
      images: sample(photos, randInt(1, 3)),
      isVerifiedPurchase: Math.random() < 0.8,
      status: 'visible',
      createdAt: randomPastDate(180)
    };
  });
}

module.exports = { generateReviews, generateProductReviews };
