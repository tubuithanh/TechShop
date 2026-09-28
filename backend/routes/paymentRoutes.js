const express = require('express');
const router = express.Router();
const {
  createVnpayPayment,
  vnpayReturn,
  vnpayIpn,
  vnpayStatus,
  createMomoPayment,
  momoReturn,
  momoIpn,
  paymentMethods
} = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');

// Cổng thanh toán đang dùng được (trang thanh toán ẩn cổng chưa cấu hình)
router.get('/methods', paymentMethods);

// VNPay
router.get('/vnpay/status', vnpayStatus);
router.get('/vnpay/ipn', vnpayIpn); // VNPay gọi trực tiếp, không có token đăng nhập - bảo vệ bằng chữ ký
router.get('/vnpay/return', vnpayReturn); // bảo vệ bằng chữ ký VNPay
router.post('/vnpay/:orderId', protect, createVnpayPayment);

// MoMo
router.post('/momo/ipn', momoIpn); // MoMo gọi trực tiếp (JSON), không có token đăng nhập - bảo vệ bằng chữ ký
router.get('/momo/return', momoReturn); // bảo vệ bằng chữ ký MoMo
router.post('/momo/:orderId', protect, createMomoPayment);

module.exports = router;
