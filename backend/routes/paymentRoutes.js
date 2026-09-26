const express = require('express');
const router = express.Router();
const { createVnpayPayment, vnpayReturn, vnpayIpn } = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/vnpay/ipn', vnpayIpn); // VNPay gọi trực tiếp, không có token đăng nhập - bảo vệ bằng chữ ký
router.get('/vnpay/return', vnpayReturn); // bảo vệ bằng chữ ký VNPay
router.post('/vnpay/:orderId', protect, createVnpayPayment);

module.exports = router;
