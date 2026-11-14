// Chặn NoSQL injection: bỏ mọi khóa bắt đầu bằng "$" (toán tử MongoDB như $ne, $gt, $where...) trong
// body, query và params ở mọi cấp lồng nhau. VD đăng nhập { "email": { "$ne": null } } -> { "email": {} }
// nên không khớp tài khoản nào. Không bỏ khóa có dấu chấm vì tên thông số sản phẩm có thể chứa dấu chấm.
const MAX_DEPTH = 10; // độ sâu lồng nhau tối đa được duyệt (chống dữ liệu lồng cực sâu làm tràn ngăn xếp)

// Duyệt đệ quy và xóa khóa "$..." ngay trên object gốc (sửa tại chỗ)
function strip(value, depth = 0) {
  if (!value || typeof value !== 'object') return value; // chuỗi / số / null: không có khóa để xóa
  if (Array.isArray(value)) { // mảng: làm sạch từng phần tử
    value.forEach((v) => strip(v, depth + 1));
    return value;
  }
  for (const key of Object.keys(value)) { // object: xét từng khóa
    if (key.startsWith('$')) delete value[key]; // khóa toán tử MongoDB -> xóa
    // SỬA LỖI: trước đây quá MAX_DEPTH thì trả nguyên object -> khóa "$" lồng sâu hơn 10 cấp lọt qua.
    // Nay dữ liệu lồng quá sâu bị bỏ hẳn (dữ liệu hợp lệ của hệ thống không bao giờ sâu tới mức này).
    else if (depth >= MAX_DEPTH && value[key] && typeof value[key] === 'object') delete value[key];
    else strip(value[key], depth + 1); // giá trị bên trong -> làm sạch tiếp ở cấp sâu hơn
  }
  return value;
}

function sanitizeInput(req, res, next) {
  strip(req.body); // dữ liệu gửi lên (JSON / form)
  strip(req.query); // tham số trên URL (?a=b)
  strip(req.params); // tham số đường dẫn (/:id)
  next(); // chuyển tiếp
}

module.exports = sanitizeInput; // dùng trong app.js
module.exports.strip = strip; // xuất để test / socket dùng lại
