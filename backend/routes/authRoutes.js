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
router.get('/zalo/callback', zaloCallback);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

module.exports = router;
