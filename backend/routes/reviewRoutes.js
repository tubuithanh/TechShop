const express = require('express');
const router = express.Router();
const { hideReview, replyReview, getAllReviewsAdmin } = require('../controllers/reviewController');
const { protect, can } = require('../middlewares/authMiddleware');

router.get('/admin/all', protect, can('reviews.manage'), getAllReviewsAdmin);
router.put('/:id/hide', protect, can('reviews.manage'), hideReview);
router.post('/:id/reply', protect, can('reviews.manage'), replyReview);

module.exports = router;
