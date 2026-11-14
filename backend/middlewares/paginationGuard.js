// Chuẩn hóa tham số phân trang cho MỌI API danh sách: limit là số nguyên 1..MAX_LIMIT, page là số nguyên >= 1.
// Trước đây gọi ?limit=1000000 là server phải tải cả bảng (chậm, tốn bộ nhớ); ?page=abc hay ?limit[$gt]=0
// làm truy vấn lỗi. Không truyền thì giữ nguyên để mỗi API dùng giá trị mặc định riêng.
const MAX_LIMIT = 200; // đủ cho ô chọn sản phẩm ở trang tồn kho (đang lấy 200 sản phẩm)
const MAX_PAGE = 100000; // chặn số trang vô lý (skip quá lớn cũng làm MongoDB chậm)

// Đổi giá trị bất kỳ thành số nguyên nằm trong [min, max]
function toInt(value, min, max) {
  const n = Math.floor(Number(Array.isArray(value) ? value[0] : value)); // ?limit=5&limit=9 -> lấy phần tử đầu; làm tròn xuống
  if (!Number.isFinite(n)) return min; // "abc", object... -> NaN -> dùng giá trị nhỏ nhất
  return Math.min(max, Math.max(min, n)); // ép vào khoảng [min, max]
}

module.exports = function paginationGuard(req, res, next) {
  if (req.query.limit !== undefined) req.query.limit = String(toInt(req.query.limit, 1, MAX_LIMIT)); // có limit -> chuẩn hóa
  if (req.query.page !== undefined) req.query.page = String(toInt(req.query.page, 1, MAX_PAGE)); // có page -> chuẩn hóa
  next(); // chuyển sang middleware tiếp theo
};
module.exports.MAX_LIMIT = MAX_LIMIT; // xuất để controller dùng chung giới hạn
