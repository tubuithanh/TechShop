// Đánh giá NHIỀU TIÊU CHÍ sau khi nhận hàng (như các sàn thương mại điện tử): điểm tổng + điểm từng tiêu chí,
// thẻ nhận xét nhanh, ẩn danh. Thêm / bớt tiêu chí hoặc thẻ: sửa ở đây (giao diện lấy danh sách từ API).
const CRITERIA = [
  { key: 'quality', label: 'Chất lượng sản phẩm' },
  { key: 'accuracy', label: 'Đúng với mô tả' },
  { key: 'packaging', label: 'Đóng gói' },
  { key: 'delivery', label: 'Tốc độ giao hàng' },
  { key: 'service', label: 'Thái độ phục vụ' }
];

const TAGS = {
  positive: ['Chất lượng tuyệt vời', 'Đúng mô tả', 'Đáng tiền', 'Đóng gói cẩn thận', 'Giao hàng nhanh', 'Hàng chính hãng', 'Nhân viên nhiệt tình', 'Pin tốt', 'Màn hình đẹp', 'Hiệu năng mượt'],
  negative: ['Giao hàng chậm', 'Đóng gói sơ sài', 'Không giống mô tả', 'Có lỗi / trầy xước', 'Thiếu phụ kiện']
};
const ALL_TAGS = new Set([...TAGS.positive, ...TAGS.negative]);
const MAX_TAGS = 6;

// Đọc phần mở rộng của đánh giá từ body; partial = đang SỬA (chỉ đổi trường có gửi). Trả về { error } hoặc { values }
function parseReviewExtras(body = {}, partial = false) {
  const values = {};
  if (body.criteria !== undefined || !partial) {
    const raw = body.criteria || {};
    if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Điểm tiêu chí không hợp lệ' };
    const criteria = {};
    for (const c of CRITERIA) {
      if (raw[c.key] === undefined || raw[c.key] === null || raw[c.key] === '') continue; // tiêu chí không bắt buộc
      const n = Number(raw[c.key]);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: `Điểm "${c.label}" phải từ 1 đến 5 sao` };
      criteria[c.key] = n;
    }
    values.criteria = criteria;
  }
  if (body.tags !== undefined || !partial) {
    const tags = body.tags ?? [];
    if (!Array.isArray(tags) || tags.length > MAX_TAGS || tags.some((t) => !ALL_TAGS.has(t))) return { error: `Chọn tối đa ${MAX_TAGS} nhận xét nhanh trong danh sách` };
    values.tags = [...new Set(tags)];
  }
  if (body.isAnonymous !== undefined || !partial) {
    if (body.isAnonymous !== undefined && typeof body.isAnonymous !== 'boolean') return { error: 'Tùy chọn ẩn danh không hợp lệ' };
    values.isAnonymous = body.isAnonymous === true;
  }
  return { values };
}

// "Nguyễn Văn An" -> "N***n" (ẩn danh vẫn cho thấy là người thật, không lộ tên)
function maskName(name) {
  const s = String(name || '').trim();
  if (s.length <= 2) return '***';
  return `${s[0]}***${s[s.length - 1]}`;
}

module.exports = { CRITERIA, TAGS, MAX_TAGS, parseReviewExtras, maskName };
