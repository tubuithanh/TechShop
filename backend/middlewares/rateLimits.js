const rateLimit = require('express-rate-limit'); // thư viện đếm số request theo IP trong 1 khoảng thời gian
const Setting = require('../models/Setting'); // cấu hình hệ thống (bật/tắt giới hạn, số lần cho phép)

// Giới hạn tần suất gọi API theo IP (chống lạm dụng & tấn công dồn dập).
// Bật/tắt và số lần cho phép cấu hình ở Admin -> Cấu hình hệ thống -> Bảo mật (mặc định BẬT, số lần mặc định
// bên dưới). Biến môi trường RATE_LIMIT_DISABLED=true luôn tắt, bất kể cấu hình (dùng khi chạy kiểm thử tự động).
// Lưu ý: cần app.set('trust proxy', 1) khi chạy sau proxy (Render) - nếu không, mọi khách đều có chung IP
// của proxy và giới hạn sẽ áp dụng chung cho TOÀN BỘ người dùng.

const WINDOW_MINUTES = 15; // cửa sổ đếm: 15 phút

// Số lần tối đa mỗi IP / 15 phút cho từng nhóm chức năng. min của "api" cao hơn để admin không tự khóa mình
// khỏi trang quản trị khi đặt quá thấp.
const LIMIT_RULES = {
  api: { label: 'Toàn bộ API của website', default: Number(process.env.API_RATE_LIMIT) || 1000, min: 100 },
  login: { label: 'Đăng nhập', default: 20, min: 1 },
  registerOtp: { label: 'Xin mã OTP đăng ký', default: 10, min: 1 },
  reset: { label: 'Quên mật khẩu (xin mã / đặt lại)', default: 10, min: 1 },
  order: { label: 'Đặt hàng', default: 20, min: 1 },
  quote: { label: 'Xem trước tổng tiền (giỏ hàng / thanh toán)', default: 300, min: 30 },
  review: { label: 'Viết / sửa đánh giá', default: 20, min: 1 },
  upload: { label: 'Tải ảnh lên', default: 30, min: 1 }
};
const MAX_LIMIT = 100000; // trần số lần admin được nhập
const DEFAULT_LIMITS = Object.fromEntries(Object.entries(LIMIT_RULES).map(([k, r]) => [k, r.default])); // { api: 1000, login: 20, ... }

// Giá trị đã lưu -> giá trị dùng được (thiếu / sai thì dùng mặc định)
function effectiveLimits(saved) {
  return Object.fromEntries( // dựng lại object từ danh sách [khóa, giá trị]
    Object.entries(LIMIT_RULES).map(([k, r]) => { // duyệt từng nhóm giới hạn
      const v = saved?.[k]; // giá trị admin đã lưu (có thể không có)
      return [k, Number.isInteger(v) && v >= r.min && v <= MAX_LIMIT ? v : r.default]; // hợp lệ thì dùng, không thì mặc định
    })
  );
}

// Kiểm tra số lần admin nhập; trả về { error } hoặc { limits } (chỉ gồm các khóa có gửi)
function parseLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Giới hạn không hợp lệ' }; // phải là object
  const limits = {};
  for (const [k, v] of Object.entries(input)) { // từng khóa admin gửi
    const rule = LIMIT_RULES[k];
    if (!rule) return { error: `Không có giới hạn "${k}"` }; // khóa lạ -> từ chối
    const n = Number(v);
    if (!Number.isInteger(n) || n < rule.min || n > MAX_LIMIT) { // phải là số nguyên trong khoảng cho phép
      return { error: `"${rule.label}" phải là số nguyên từ ${rule.min} đến ${MAX_LIMIT.toLocaleString('vi-VN')}` };
    }
    limits[k] = n; // hợp lệ -> nhận
  }
  return { limits };
}

// Đọc cấu hình có bộ nhớ đệm 30 giây - không truy vấn DB ở mỗi request
const CACHE_MS = 30 * 1000;
let cache = null; // { enabled, limits, at }
async function getRateLimitConfig() {
  if (!cache || Date.now() - cache.at > CACHE_MS) { // chưa có hoặc đã cũ hơn 30 giây -> đọc lại DB
    const setting = await Setting.findOne().select('+rateLimitEnabled +rateLimits').lean().catch(() => null); // 2 trường ẩn mặc định nên phải chọn "+"
    cache = {
      enabled: setting?.rateLimitEnabled !== false, // lỗi đọc DB -> vẫn bật cho an toàn
      limits: effectiveLimits(setting?.rateLimits), // số lần dùng thực tế
      at: Date.now() // thời điểm đọc
    };
  }
  return cache;
}
const isRateLimitEnabled = async () => (await getRateLimitConfig()).enabled; // đang bật giới hạn không?
function clearRateLimitCache() { // gọi khi admin lưu cấu hình mới -> có hiệu lực ngay, không đợi 30 giây
  cache = null;
}

// Bỏ qua giới hạn khi: biến môi trường tắt (test) hoặc admin tắt trong cấu hình
const shouldSkip = async () => process.env.RATE_LIMIT_DISABLED === 'true' || !(await isRateLimitEnabled());

// Tạo 1 bộ giới hạn cho nhóm "key" với thông báo lỗi riêng
function limiter(key, message) {
  return rateLimit({
    windowMs: WINDOW_MINUTES * 60 * 1000, // cửa sổ 15 phút (tính bằng mili giây)
    max: async () => (await getRateLimitConfig()).limits[key], // đọc theo cấu hình hiện hành - đổi là có hiệu lực ngay
    standardHeaders: true, // gửi header RateLimit-* chuẩn cho client biết còn bao nhiêu lượt
    legacyHeaders: false, // không gửi header kiểu cũ X-RateLimit-*
    message: { message }, // vượt giới hạn -> trả 429 với JSON { message }
    skip: shouldSkip // hàm quyết định có bỏ qua không
  });
}

// Chung cho toàn bộ API - một trang thường gọi khoảng 10 API, nên 1000/15 phút là rất rộng cho người dùng
// thật nhưng chặn được việc gọi dồn dập để quét dữ liệu hoặc làm quá tải máy chủ.
const apiLimiter = limiter('api', 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau ít phút');
// Đăng nhập - chống dò mật khẩu (brute-force)
const loginLimiter = limiter('login', 'Bạn đã thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút');
// Xin mã OTP đăng ký / quên mật khẩu - mỗi lần gửi 1 email, tránh bị lợi dụng gửi email hàng loạt
const registerOtpLimiter = limiter('registerOtp', 'Bạn đã yêu cầu mã quá nhiều lần, vui lòng thử lại sau ít phút');
const resetLimiter = limiter('reset', 'Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau ít phút');
// Tạo đơn hàng, viết/sửa đánh giá - chống spam
const orderLimiter = limiter('order', 'Bạn đặt hàng quá nhiều lần trong thời gian ngắn, vui lòng thử lại sau ít phút');
// Xem trước tổng tiền: trang thanh toán gọi lại mỗi khi đổi chi nhánh / mã nên rộng hơn đặt hàng, nhưng
// vẫn chặn việc gọi dồn dập (mỗi lần tính khuyến mãi tốn vài truy vấn) hoặc dò mã giảm giá hàng loạt.
const quoteLimiter = limiter('quote', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút');
const reviewLimiter = limiter('review', 'Bạn gửi đánh giá quá nhiều lần, vui lòng thử lại sau ít phút');
// Tải ảnh - tránh bị lợi dụng làm đầy ổ đĩa/Cloudinary
const uploadLimiter = limiter('upload', 'Bạn tải ảnh quá nhiều lần, vui lòng thử lại sau ít phút');

module.exports = { // xuất các bộ giới hạn (gắn vào route) + hàm cấu hình (dùng ở settingController)
  apiLimiter,
  loginLimiter,
  registerOtpLimiter,
  resetLimiter,
  orderLimiter,
  quoteLimiter,
  reviewLimiter,
  uploadLimiter,
  isRateLimitEnabled,
  getRateLimitConfig,
  clearRateLimitCache,
  parseLimits,
  effectiveLimits,
  LIMIT_RULES,
  DEFAULT_LIMITS,
  MAX_LIMIT,
  WINDOW_MINUTES
};
