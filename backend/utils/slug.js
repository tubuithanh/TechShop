const slugify = require('slugify');

// Tạo đường dẫn thân thiện (slug) an toàn cho URL: chỉ giữ chữ, số và dấu gạch ngang, bỏ dấu tiếng Việt.
// strict: true loại mọi ký tự đặc biệt - trước đây chỉ bỏ vài ký tự (:?!,.;'"()) nên tiêu đề có "/" (VD
// "32GB/1TB SSD") tạo ra slug chứa "/", làm link bài viết mở ra trang trắng.
function makeSlug(text) {
  return slugify(String(text || ''), { lower: true, locale: 'vi', strict: true, trim: true });
}

module.exports = { makeSlug };
