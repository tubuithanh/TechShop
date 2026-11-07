// Lọc theo khoảng ngày do người dùng chọn (ô ngày "YYYY-MM-DD" trên trang quản trị).
// Ngày được hiểu theo GIỜ VIỆT NAM (UTC+7): "2026-11-07" = 00:00 -> 23:59:59.999 ngày 07/11 ở Việt Nam.
// Trước đây new Date("2026-11-07") là 00:00 UTC = 07:00 sáng giờ Việt Nam, nên lọc "từ ngày" bỏ sót các thao tác /
// đơn hàng từ 0h đến 7h sáng, còn "đến ngày" lại lấy lấn sang 7 tiếng của ngày hôm sau.
const VN_OFFSET = '+07:00';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value, endOfDay) {
  if (typeof value !== 'string' || !value) return null;
  if (DAY_RE.test(value)) {
    const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${VN_OFFSET}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Nhận cả mốc thời gian đầy đủ (ISO) như trước
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// { $gte, $lte } cho truy vấn MongoDB, hoặc null nếu không lọc
function dateRange(from, to) {
  const range = {};
  const start = parseDay(from, false);
  const end = parseDay(to, true);
  if (start) range.$gte = start;
  if (end) range.$lte = end;
  return Object.keys(range).length ? range : null;
}

module.exports = { dateRange, parseDay };
