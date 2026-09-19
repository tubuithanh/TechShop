const express = require('express');
const router = express.Router();
const {
  requestRegisterOtp,
  verifyRegisterOtp,
  register,
  login,
  zaloLoginRedirect,
  zaloCallback,
  refresh,
  logout,
  getMe,
  changePassword
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/register/request-otp', requestRegisterOtp);
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
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

module.exports = router;
