const rateLimit = require('express-rate-limit');
const Setting = require('../models/Setting');

// Giới hạn tần suất gọi API theo IP (chống lạm dụng & tấn công dồn dập).
// Bật/tắt và số lần cho phép cấu hình ở Admin -> Cấu hình hệ thống -> Bảo mật (mặc định BẬT, số lần mặc định
// bên dưới). Biến môi trường RATE_LIMIT_DISABLED=true luôn tắt, bất kể cấu hình (dùng khi chạy kiểm thử tự động).
// Lưu ý: cần app.set('trust proxy', 1) khi chạy sau proxy (Render) - nếu không, mọi khách đều có chung IP
// của proxy và giới hạn sẽ áp dụng chung cho TOÀN BỘ người dùng.

const WINDOW_MINUTES = 15;

// Số lần tối đa mỗi IP / 15 phút cho từng nhóm chức năng. min của "api" cao hơn để admin không tự khóa mình
// khỏi trang quản trị khi đặt quá thấp.
const LIMIT_RULES = {
  api: { label: 'Toàn bộ API của website', default: Number(process.env.API_RATE_LIMIT) || 1000, min: 100 },
  login: { label: 'Đăng nhập', default: 20, min: 1 },
  registerOtp: { label: 'Xin mã OTP đăng ký', default: 10, min: 1 },
  reset: { label: 'Quên mật khẩu (xin mã / đặt lại)', default: 10, min: 1 },
  order: { label: 'Đặt hàng', default: 20, min: 1 },
  review: { label: 'Viết / sửa đánh giá', default: 20, min: 1 },
  upload: { label: 'Tải ảnh lên', default: 30, min: 1 }
};
const MAX_LIMIT = 100000;
const DEFAULT_LIMITS = Object.fromEntries(Object.entries(LIMIT_RULES).map(([k, r]) => [k, r.default]));

// Giá trị đã lưu -> giá trị dùng được (thiếu / sai thì dùng mặc định)
function effectiveLimits(saved) {
  return Object.fromEntries(
    Object.entries(LIMIT_RULES).map(([k, r]) => {
      const v = saved?.[k];
      return [k, Number.isInteger(v) && v >= r.min && v <= MAX_LIMIT ? v : r.default];
    })
  );
}

// Kiểm tra số lần admin nhập; trả về { error } hoặc { limits } (chỉ gồm các khóa có gửi)
function parseLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Giới hạn không hợp lệ' };
  const limits = {};
  for (const [k, v] of Object.entries(input)) {
    const rule = LIMIT_RULES[k];
    if (!rule) return { error: `Không có giới hạn "${k}"` };
    const n = Number(v);
    if (!Number.isInteger(n) || n < rule.min || n > MAX_LIMIT) {
      return { error: `"${rule.label}" phải là số nguyên từ ${rule.min} đến ${MAX_LIMIT.toLocaleString('vi-VN')}` };
    }
    limits[k] = n;
  }
  return { limits };
}

// Đọc cấu hình có bộ nhớ đệm 30 giây - không truy vấn DB ở mỗi request
const CACHE_MS = 30 * 1000;
let cache = null;
async function getRateLimitConfig() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const setting = await Setting.findOne().select('+rateLimitEnabled +rateLimits').lean().catch(() => null);
    cache = {
      enabled: setting?.rateLimitEnabled !== false, // lỗi đọc DB -> vẫn bật cho an toàn
      limits: effectiveLimits(setting?.rateLimits),
      at: Date.now()
    };
  }
  return cache;
}
const isRateLimitEnabled = async () => (await getRateLimitConfig()).enabled;
function clearRateLimitCache() {
  cache = null;
}

const shouldSkip = async () => process.env.RATE_LIMIT_DISABLED === 'true' || !(await isRateLimitEnabled());

function limiter(key, message) {
  return rateLimit({
    windowMs: WINDOW_MINUTES * 60 * 1000,
    max: async () => (await getRateLimitConfig()).limits[key], // đọc theo cấu hình hiện hành - đổi là có hiệu lực ngay
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    skip: shouldSkip
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
const reviewLimiter = limiter('review', 'Bạn gửi đánh giá quá nhiều lần, vui lòng thử lại sau ít phút');
// Tải ảnh - tránh bị lợi dụng làm đầy ổ đĩa/Cloudinary
const uploadLimiter = limiter('upload', 'Bạn tải ảnh quá nhiều lần, vui lòng thử lại sau ít phút');

module.exports = {
  apiLimiter,
  loginLimiter,
  registerOtpLimiter,
  resetLimiter,
  orderLimiter,
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
