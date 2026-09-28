const express = require('express');
const rateLimit = require('express-rate-limit');
const { registerOtpLimiter } = require('../middlewares/rateLimits');
const router = express.Router();
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
  requestPasswordReset,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/register/request-otp', registerOtpLimiter, requestRegisterOtp);

// Quên mật khẩu: giới hạn số lần xin mã để không bị lợi dụng gửi email hàng loạt tới 1 người
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau ít phút' },
  skip: () => process.env.RATE_LIMIT_DISABLED === 'true'
});
router.post('/password/request-otp', resetLimiter, requestPasswordReset);
router.post('/password/reset', resetLimiter, resetPassword);
router.post('/register/verify-otp', verifyRegisterOtp);
router.post('/register', register);
router.post('/login', login);
router.get('/zalo/login', zaloLoginRedirect);
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
router.get('/zalo/callback', zaloCallback);
// Frontend tự gọi graph.zalo.me lấy hồ sơ (mang IP thật của trình duyệt) rồi POST kết quả vào đây
// để hoàn tất đăng nhập - xem giải thích trong authController.js (zaloCallback / zaloComplete).
router.post('/zalo/complete', zaloComplete);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

module.exports = router;
