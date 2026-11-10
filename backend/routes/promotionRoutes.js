const express = require('express');
const router = express.Router();
const {
  getPromotions,
  getActivePromotions,
  createPromotion,
  updatePromotion,
  deletePromotion
} = require('../controllers/promotionController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');

// Giống mã giảm giá: ai có quyền "Xem danh sách khuyến mãi" được xem; chỉ admin được tạo / sửa / tắt
router.get('/active', getActivePromotions);
router.get('/', protect, can('vouchers.view'), getPromotions);
router.post('/', protect, authorize('admin'), createPromotion);
router.put('/:id', protect, authorize('admin'), updatePromotion);
router.delete('/:id', protect, authorize('admin'), deletePromotion);

module.exports = router;
