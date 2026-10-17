// Chặn NoSQL injection: bỏ mọi khóa bắt đầu bằng "$" (toán tử MongoDB như $ne, $gt, $where...) trong
// body, query và params ở mọi cấp lồng nhau. VD đăng nhập { "email": { "$ne": null } } -> { "email": {} }
// nên không khớp tài khoản nào. Không bỏ khóa có dấu chấm vì tên thông số sản phẩm có thể chứa dấu chấm.
const MAX_DEPTH = 10;

function strip(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    value.forEach((v) => strip(v, depth + 1));
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$')) delete value[key];
    else strip(value[key], depth + 1);
  }
  return value;
}

function sanitizeInput(req, res, next) {
  strip(req.body);
  strip(req.query);
  strip(req.params);
  next();
}

module.exports = sanitizeInput;
module.exports.strip = strip;
