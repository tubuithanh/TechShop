// routes/authRoutes.js - các URL tài khoản, gắn tại /api/auth (xem app.js)
const express = require('express');
const { registerOtpLimiter, resetLimiter } = require('../middlewares/rateLimits'); // giới hạn số lần gửi email
const router = express.Router(); // bộ định tuyến con
const {
  requestRegisterOtp,
  verifyRegisterOtp,
  register,
  login,
  zaloLoginRedirect,
  zaloCallback,
  zaloComplete,
  refresh,
  logout,
  getMe,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
  requestPasswordReset,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware'); // bắt buộc đăng nhập

router.post('/register/request-otp', registerOtpLimiter, requestRegisterOtp); // B1 đăng ký: xin mã OTP

// Quên mật khẩu: giới hạn số lần xin mã (middlewares/rateLimits.js)
router.post('/password/request-otp', resetLimiter, requestPasswordReset); // xin mã đặt lại mật khẩu
router.post('/password/reset', resetLimiter, resetPassword); // nhập mã + mật khẩu mới
router.post('/register/verify-otp', verifyRegisterOtp); // B2 đăng ký: xác thực mã (sai 5 lần là khóa mã)
router.post('/register', register); // B3 đăng ký: tạo tài khoản
router.post('/login', login); // đăng nhập (loginLimiter đã gắn ở app.js)
router.get('/zalo/login', zaloLoginRedirect); // bắt đầu đăng nhập Zalo
// File xác thực quyền sở hữu URL callback cho Zalo (mục "Xác thực domain" > Tiền tố URL trên
// dashboard Zalo) - Zalo yêu cầu file này truy cập được đúng tại /api/auth/zalo/callback/<file>.html,
// nên phải khai báo route tĩnh riêng ở đây (route bên dưới xử lý OAuth thật không phục vụ file tĩnh).
router.get('/zalo/callback/zalo_verifierNDMO0fkd2pPgrvawuDmlO3Bug3VUZd9XD3Kt.html', (req, res) => {
  res.type('html').send(
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta property="zalo-platform-site-verification" content="NDMO0fkd2pPgrvawuDmlO3Bug3VUZd9XD3Kt" />\n' +
      '</head>\n<body>\nThere Is No Limit To What You Can Accomplish Using Zalo!\n</body>\n</html>\n'
  );
});
router.get('/zalo/callback', zaloCallback); // Zalo gọi về sau khi người dùng đồng ý
// Frontend tự gọi graph.zalo.me lấy hồ sơ (mang IP thật của trình duyệt) rồi POST kết quả vào đây
// để hoàn tất đăng nhập - xem giải thích trong authController.js (zaloCallback / zaloComplete).
router.post('/zalo/complete', zaloComplete);
router.post('/refresh', refresh); // xin access token mới bằng cookie refresh token
router.post('/logout', logout); // đăng xuất (xóa cookie)
router.get('/me', protect, getMe); // thông tin tài khoản hiện tại
// Tài khoản demo hiển thị ở trang đăng nhập (chỉ khi admin bật)
router.get('/demo-accounts', require('../controllers/demoAccountsController').getDemoAccounts);
router.put('/change-password', protect, changePassword); // đổi mật khẩu
// Đổi email (xác thực bằng mã gửi tới email mới) - giới hạn tần suất như xin mã đăng ký vì mỗi lần gửi 1 email
router.post('/email/request-otp', protect, registerOtpLimiter, requestEmailChange);
router.post('/email/verify', protect, verifyEmailChange); // nhập mã xác nhận email mới

module.exports = router;
