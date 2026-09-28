const express = require('express');
const router = express.Router();
const c = require('../controllers/slideController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Công khai - trang chủ
router.get('/', c.getSlides);

// Quản trị - chỉ admin
const admin = [protect, authorize('admin')];
router.get('/admin', admin, c.getSlidesAdmin);
router.post('/', admin, c.createSlide);
router.put('/reorder', admin, c.reorderSlides);
router.put('/:id', admin, c.updateSlide);
router.delete('/:id', admin, c.deleteSlide);

module.exports = router;
