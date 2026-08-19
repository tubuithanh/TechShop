const slugify = require('slugify');

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(daysBack = 200) {
  return new Date(Date.now() - randInt(0, daysBack) * 86400000);
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text, maxCharsPerLine = 18, maxLines = 2) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = (current + ' ' + word).trim();
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

const POST_CATEGORY_STYLE = {
  tu_van: '#2563eb',
  danh_gia: '#d97706',
  thu_thuat: '#059669',
  tin_tuc: '#7c3aed'
};

// Hình minh họa bài viết dạng "trang báo" SVG nhúng trực tiếp (data URI) - không cần ảnh thật
function makePostImage(title, categoryKey, size = 800) {
  const color = POST_CATEGORY_STYLE[categoryKey] || '#4b5563';
  const lines = wrapLines(title);
  const fontSize = Math.round(size * 0.042);
  const lineHeight = fontSize * 1.3;
  const captionY = size * 0.86;
  const startY = captionY - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${size / 2}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">` +
    `<rect width="200" height="200" fill="#f3f4f6"/>` +
    `<rect x="45" y="35" width="110" height="100" rx="6" fill="${color}"/>` +
    `<rect x="57" y="49" width="86" height="34" fill="#ffffff" opacity="0.9"/>` +
    `<rect x="57" y="91" width="86" height="6" rx="3" fill="#ffffff" opacity="0.7"/>` +
    `<rect x="57" y="104" width="66" height="6" rx="3" fill="#ffffff" opacity="0.7"/>` +
    `<rect x="57" y="117" width="76" height="6" rx="3" fill="#ffffff" opacity="0.7"/>` +
    `<text text-anchor="middle" fill="#374151" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="600">${tspans}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildTitle(catKey, ctx) {
  const { productA, productB, categoryLabel, brandLabel } = ctx;
  if (catKey === 'tu_van') {
    return pick([
      `Nên chọn ${productA} hay ${productB}?`,
      `Kinh nghiệm chọn mua ${categoryLabel.toLowerCase()} phù hợp nhu cầu`,
      `So sánh ${productA} và ${productB}: đâu là lựa chọn tốt hơn?`,
      `Tư vấn: có nên nâng cấp lên ${productA} lúc này?`
    ]);
  }
  if (catKey === 'danh_gia') {
    return pick([
      `Đánh giá chi tiết ${productA} sau 1 tháng sử dụng`,
      `Trên tay ${productA}: có đáng mua ở thời điểm hiện tại?`,
      `Trải nghiệm thực tế ${productA}: ưu và nhược điểm`,
      `Review nhanh ${productA} dành cho người mới`
    ]);
  }
  if (catKey === 'thu_thuat') {
    return pick([
      `5 mẹo giúp ${categoryLabel.toLowerCase()} bền hơn theo thời gian`,
      `Cách tối ưu hiệu năng ${categoryLabel.toLowerCase()} hiệu quả nhất`,
      `Những sai lầm thường gặp khi dùng ${categoryLabel.toLowerCase()}`,
      `Hướng dẫn bảo quản ${categoryLabel.toLowerCase()} đúng cách`
    ]);
  }
  return pick([
    `${brandLabel} chuẩn bị ra mắt sản phẩm mới với nhiều cải tiến`,
    `Xu hướng công nghệ 2026: ${brandLabel} dẫn đầu thị trường`,
    `${brandLabel} cập nhật chính sách bảo hành mới cho khách hàng`,
    `Điểm tin công nghệ: những cập nhật mới nhất từ ${brandLabel}`
  ]);
}

const CATEGORY_LABEL_VI = { tu_van: 'tư vấn', danh_gia: 'đánh giá', thu_thuat: 'thủ thuật', tin_tuc: 'tin tức' };

function generatePosts(count, { admins, products, categoryNames, brandNames }) {
  const CATEGORY_KEYS = ['tu_van', 'danh_gia', 'thu_thuat', 'tin_tuc'];
  const posts = [];
  for (let i = 1; i <= count; i++) {
    const catKey = pick(CATEGORY_KEYS);
    const productA = pick(products);
    const productB = pick(products);
    const categoryLabel = pick(categoryNames);
    const brandLabel = pick(brandNames);
    const title = buildTitle(catKey, { productA: productA.title, productB: productB.title, categoryLabel, brandLabel });
    const shortDescription = `Bài viết ${CATEGORY_LABEL_VI[catKey]} dành cho bạn đọc quan tâm tới ${categoryLabel.toLowerCase()}.`;
    const content =
      `${shortDescription} Nội dung được đội ngũ biên tập TechShop tổng hợp và biên soạn nhằm mang lại thông tin hữu ích, ` +
      `giúp bạn đọc đưa ra quyết định mua sắm phù hợp nhất với nhu cầu sử dụng thực tế. Bài viết có thể được cập nhật ` +
      `theo thời gian khi có thông tin mới. Nếu có bất kỳ thắc mắc nào, đừng ngần ngại để lại bình luận hoặc liên hệ ` +
      `trực tiếp với đội ngũ tư vấn của TechShop qua hotline hoặc tại các cửa hàng trên toàn quốc.`;
    const author = pick(admins);
    // slugify mặc định không loại bỏ dấu ":" nên phải tự loại bỏ thêm dấu câu còn sót lại
    // (tiêu đề bài viết có thể chứa ":", "?"...) để slug luôn là URL hợp lệ.
    const slug = `${slugify(title, { lower: true, locale: 'vi', remove: /[:?!,.;'"()]/g })}-${String(i).padStart(4, '0')}`;

    posts.push({
      userId: author._id,
      title,
      slug,
      category: catKey,
      nameAuthor: author.name,
      featuredImage: makePostImage(title, catKey),
      shortDescription,
      content,
      isFeatured: Math.random() < 0.03,
      relatedProductIds: [productA._id, productB._id],
      isPublished: Math.random() < 0.95,
      viewCount: randInt(0, 5000),
      createdAt: randomPastDate()
    });
  }
  return posts;
}

module.exports = { generatePosts };
