const express = require('express');
const router = express.Router();
const { protect, authorize, can } = require('../middlewares/authMiddleware');
const c = require('../controllers/expressController');

// Giao hỏa tốc: công khai xem sản phẩm đang hỏa tốc; khách kiểm tra theo vị trí; quản lý mở / sửa / tắt khung giờ
router.get('/active', c.active);
router.post('/check', protect, authorize('customer'), c.check);
router.get('/admin', protect, can('deliveries.manage'), c.adminList);
router.post('/admin', protect, can('deliveries.manage'), c.create);
router.put('/admin/:id', protect, can('deliveries.manage'), c.update);

module.exports = router;
