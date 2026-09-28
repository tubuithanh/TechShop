const rateLimit = require('express-rate-limit');

// Giới hạn tần suất gọi API theo IP. Đặt RATE_LIMIT_DISABLED=true để tắt (VD khi chạy kiểm thử tự động).
// Lưu ý: cần app.set('trust proxy', 1) khi chạy sau proxy (Render) - nếu không, mọi khách đều có chung IP
// của proxy và giới hạn sẽ áp dụng chung cho TOÀN BỘ người dùng.
function limiter({ minutes = 15, max, message }) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    skip: () => process.env.RATE_LIMIT_DISABLED === 'true'
  });
}

// Mức chung cho toàn bộ API - một trang thường gọi khoảng 10 API, nên 1000/15 phút là rất rộng cho người dùng
// thật nhưng chặn được việc gọi dồn dập để quét dữ liệu hoặc làm quá tải máy chủ.
const apiLimiter = limiter({
  max: Number(process.env.API_RATE_LIMIT) || 1000,
  message: 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau ít phút'
});

// Xin mã OTP đăng ký - mỗi lần gửi 1 email, tránh bị lợi dụng gửi email hàng loạt
const registerOtpLimiter = limiter({ max: 10, message: 'Bạn đã yêu cầu mã quá nhiều lần, vui lòng thử lại sau ít phút' });

// Tạo đơn hàng, viết/sửa đánh giá - chống spam
const orderLimiter = limiter({ max: 20, message: 'Bạn đặt hàng quá nhiều lần trong thời gian ngắn, vui lòng thử lại sau ít phút' });
const reviewLimiter = limiter({ max: 20, message: 'Bạn gửi đánh giá quá nhiều lần, vui lòng thử lại sau ít phút' });

module.exports = { apiLimiter, registerOtpLimiter, orderLimiter, reviewLimiter };
