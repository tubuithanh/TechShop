const rateLimit = require('express-rate-limit');
const Setting = require('../models/Setting');

// Giới hạn tần suất gọi API theo IP (chống lạm dụng & tấn công dồn dập).
// Bật/tắt ở Admin -> Cấu hình hệ thống -> Bảo mật (mặc định BẬT). Biến môi trường RATE_LIMIT_DISABLED=true
// luôn tắt, bất kể cấu hình (dùng khi chạy kiểm thử tự động).
// Lưu ý: cần app.set('trust proxy', 1) khi chạy sau proxy (Render) - nếu không, mọi khách đều có chung IP
// của proxy và giới hạn sẽ áp dụng chung cho TOÀN BỘ người dùng.

// Đọc cấu hình có bộ nhớ đệm 30 giây - không truy vấn DB ở mỗi request
const CACHE_MS = 30 * 1000;
let cache = null;
async function isRateLimitEnabled() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const setting = await Setting.findOne().select('rateLimitEnabled').lean().catch(() => null);
    cache = { enabled: setting?.rateLimitEnabled !== false, at: Date.now() }; // lỗi đọc DB -> vẫn bật cho an toàn
  }
  return cache.enabled;
}
function clearRateLimitCache() {
  cache = null;
}

const shouldSkip = async () => process.env.RATE_LIMIT_DISABLED === 'true' || !(await isRateLimitEnabled());

function limiter({ minutes = 15, max, message }) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    skip: shouldSkip
  });
}

// Mức chung cho toàn bộ API - một trang thường gọi khoảng 10 API, nên 1000/15 phút là rất rộng cho người dùng
// thật nhưng chặn được việc gọi dồn dập để quét dữ liệu hoặc làm quá tải máy chủ.
const apiLimiter = limiter({
  max: Number(process.env.API_RATE_LIMIT) || 1000,
  message: 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau ít phút'
});

// Đăng nhập - chống dò mật khẩu (brute-force)
const loginLimiter = limiter({ max: 20, message: 'Bạn đã thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút' });

// Xin mã OTP đăng ký - mỗi lần gửi 1 email, tránh bị lợi dụng gửi email hàng loạt
const registerOtpLimiter = limiter({ max: 10, message: 'Bạn đã yêu cầu mã quá nhiều lần, vui lòng thử lại sau ít phút' });

// Quên mật khẩu: giới hạn số lần xin mã để không bị lợi dụng gửi email hàng loạt tới 1 người
const resetLimiter = limiter({ max: 10, message: 'Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau ít phút' });

// Tạo đơn hàng, viết/sửa đánh giá - chống spam
const orderLimiter = limiter({ max: 20, message: 'Bạn đặt hàng quá nhiều lần trong thời gian ngắn, vui lòng thử lại sau ít phút' });
const reviewLimiter = limiter({ max: 20, message: 'Bạn gửi đánh giá quá nhiều lần, vui lòng thử lại sau ít phút' });

// Tải ảnh - tránh bị lợi dụng làm đầy ổ đĩa/Cloudinary
const uploadLimiter = limiter({ max: 30, message: 'Bạn tải ảnh quá nhiều lần, vui lòng thử lại sau ít phút' });

module.exports = {
  apiLimiter,
  loginLimiter,
  registerOtpLimiter,
  resetLimiter,
  orderLimiter,
  reviewLimiter,
  uploadLimiter,
  isRateLimitEnabled,
  clearRateLimitCache
};
