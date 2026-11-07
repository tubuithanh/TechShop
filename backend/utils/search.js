// Tìm kiếm tiếng Việt không dấu, dùng chỉ mục (index) của MongoDB.
//
// Mỗi bản ghi cần tìm có thêm trường ẩn `searchTokens`: danh sách TIỀN TỐ của mọi từ trong các thông tin
// cần tìm, đã bỏ dấu và viết thường. VD tên "Nguyễn Văn" -> ["n","ng","ngu",...,"nguyen","v","va","van"].
// Khi tìm "nguyen va", từ khóa cũng được bỏ dấu, tách từ, rồi tìm bản ghi chứa ĐỦ các từ đó
// ({ searchTokens: { $all: [...] } }) - truy vấn chạy trên index nhiều giá trị (multikey) nên nhanh kể cả
// khi dữ liệu lớn, và gõ có dấu / không dấu / hoa / thường đều ra cùng kết quả.

const MAX_PREFIX = 20; // từ dài hơn chỉ lưu tiền tố tới 20 ký tự (đủ cho mã đơn, SĐT, email...)
const MAX_QUERY_WORDS = 8;

// "Nguyễn Văn ĐẠT" -> "nguyen van dat"
function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

// Tách thành các từ gồm chữ/số: "abc@gmail.com 0912.345" -> ["abc","gmail","com","0912","345"]
function splitWords(value) {
  return normalizeSearch(value).split(/[^a-z0-9]+/).filter(Boolean);
}

// Từ danh sách thông tin (chuỗi, số, mảng lồng nhau) -> danh sách tiền tố không trùng
function buildSearchTokens(parts) {
  const tokens = new Set();
  const words = splitWords([parts].flat(Infinity).filter((p) => p !== null && p !== undefined).join(' '));
  for (const word of words) {
    const max = Math.min(word.length, MAX_PREFIX);
    for (let i = 1; i <= max; i++) tokens.add(word.slice(0, i));
  }
  return [...tokens];
}

// Điều kiện truy vấn cho từ khóa người dùng gõ; null nếu từ khóa rỗng
function searchFilter(query) {
  const words = splitWords(query).slice(0, MAX_QUERY_WORDS).map((w) => w.slice(0, MAX_PREFIX));
  return words.length ? { searchTokens: { $all: words } } : null;
}

// Plugin Mongoose: thêm trường searchTokens (ẩn khỏi kết quả trả về) + index, và tự tính lại trước mỗi lần
// lưu/validate (kể cả insertMany). `getParts(doc)` trả về (có thể async) các thông tin cần tìm được.
function searchablePlugin(schema, { getParts }) {
  schema.add({ searchTokens: { type: [String], select: false } });
  schema.index({ searchTokens: 1 });
  schema.pre('validate', async function () {
    this.searchTokens = buildSearchTokens(await getParts(this));
  });
  // Dùng cho script cập nhật dữ liệu cũ (seed/backfillSearchTokens.js)
  schema.statics.computeSearchTokens = async function (doc) {
    return buildSearchTokens(await getParts(doc));
  };
}

module.exports = { normalizeSearch, splitWords, buildSearchTokens, searchFilter, searchablePlugin };
