const { SPEC_TEMPLATES } = require('./specTemplates');

// Tên thông số dạng số THEO TỪNG DANH MỤC: cùng 1 tên có thể là số ở danh mục này nhưng là chữ tự do
// ở danh mục khác (VD: "Kích thước" của màn hình là "27 inch", của điện thoại là "164 x 78 x 8 mm") -
// nên chỉ tách số theo đúng mẫu của danh mục chứa sản phẩm, tránh sinh số vô nghĩa.
const NUMERIC_KEYS_BY_CATEGORY = Object.fromEntries(
  Object.entries(SPEC_TEMPLATES).map(([slug, groups]) => [
    slug,
    new Set(groups.flatMap((g) => g.fields.filter((f) => f.numeric).map((f) => f.key)))
  ])
);

// Hợp của mọi danh mục - DANH SÁCH TRẮNG cho bộ lọc ở API (khóa được ghép vào đường dẫn truy vấn Mongo).
const NUMERIC_KEYS = new Set(Object.values(NUMERIC_KEYS_BY_CATEGORY).flatMap((s) => [...s]));

// Đơn vị nhận diện cho từng thông số - khi chuỗi có nhiều số ("2 x 512GB SSD", "512GB SSD + 1TB HDD",
// "4-cell 70Wh"), chỉ lấy các số ĐI KÈM đúng đơn vị này thay vì số đầu tiên bắt gặp.
const UNIT_PATTERNS = {
  RAM: /^(tb|gb|mb)/,
  'Bộ nhớ trong': /^(tb|gb|mb)/,
  'Ổ cứng': /^(tb|gb|mb)/,
  Pin: /^(mah|wh)/,
  'Tần số quét': /^hz/,
  'Độ sáng tối đa': /^nit/,
  'Độ sáng': /^(nit|cd)/,
  'Sạc nhanh': /^w/,
  'Công suất sạc': /^w/,
  'Trọng lượng': /^(kg|g)/,
  'Thời gian phản hồi': /^ms/,
  'Màn hình': /^(inch|")/,
  'Kích thước màn hình': /^(inch|")/,
  'Kích thước': /^(inch|")/
};

// Các thông số có giá trị thường là số thập phân nhỏ ("6.7 inch", "1.8 kg") - dấu "." ở đây là dấu
// thập phân. Ở các thông số còn lại, "5.000 mAh"/"1.600 nits" là cách viết hàng nghìn kiểu Việt Nam.
const DECIMAL_KEYS = new Set(['Màn hình', 'Kích thước màn hình', 'Kích thước', 'Trọng lượng']);

function toNumber(raw, key) {
  // Nhóm hàng nghìn: 1-3 chữ số, rồi các cụm ".ddd"/",ddd" (VD: 5.000, 10.090, 1,600)
  if (!DECIMAL_KEYS.has(key) && /^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  return Number(raw.replace(',', '.'));
}

const STORAGE_KEYS = new Set(['RAM', 'Bộ nhớ trong', 'Ổ cứng']);

function normalize(key, number, unit) {
  if (STORAGE_KEYS.has(key)) {
    if (unit.startsWith('tb')) return number * 1024;
    if (unit.startsWith('mb')) return number / 1024;
  }
  if (key === 'Trọng lượng' && unit.startsWith('kg')) return number * 1000;
  return number;
}

// Tách giá trị số của 1 thông số, quy về đơn vị chuẩn (GB, gram...). Nếu có nhiều số mang đúng đơn vị
// thì lấy số LỚN NHẤT (VD: ổ cứng kép lấy ổ lớn, "60Hz / 120Hz" lấy 120Hz). Không có số -> null.
function parseSpecNumber(key, value) {
  if (value === undefined || value === null) return null;
  const text = String(value).toLowerCase();
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)*)\s*([a-z"]*)/g)].map((m) => ({
    number: toNumber(m[1], key),
    unit: m[2]
  }));
  if (!matches.length) return null;
  const pattern = UNIT_PATTERNS[key];
  const withUnit = pattern ? matches.filter((m) => pattern.test(m.unit)) : [];
  const candidates = (withUnit.length ? withUnit : matches.slice(0, 1))
    .map((m) => normalize(key, m.number, m.unit))
    .filter(Number.isFinite);
  return candidates.length ? Math.max(...candidates) : null;
}

// specs: Map (Mongoose) hoặc object thường; categorySlug: slug danh mục của sản phẩm. Trả về object
// { tên thông số: số } chỉ cho các khóa dạng số CỦA ĐÚNG danh mục đó.
function computeSpecNumbers(specs, categorySlug) {
  const numericKeys = NUMERIC_KEYS_BY_CATEGORY[categorySlug];
  if (!numericKeys) return {};
  const entries = specs instanceof Map ? [...specs.entries()] : Object.entries(specs || {});
  const result = {};
  for (const [key, value] of entries) {
    if (!numericKeys.has(key)) continue;
    const number = parseSpecNumber(key, value);
    if (number !== null) result[key] = number;
  }
  return result;
}

module.exports = { NUMERIC_KEYS, parseSpecNumber, computeSpecNumbers };
