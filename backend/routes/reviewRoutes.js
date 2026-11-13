const express = require('express');
const router = express.Router();
const { replyReview, getAllReviewsAdmin, reviewOptions } = require('../controllers/reviewController');
const { protect, can } = require('../middlewares/authMiddleware');

router.get('/options', reviewOptions); // tiêu chí + thẻ nhận xét nhanh (công khai)
const { getReviewStats } = require('../controllers/reviewStatsController');
router.get('/admin/stats', protect, can('reviews.manage'), getReviewStats);
router.get('/admin/all', protect, can('reviews.manage'), getAllReviewsAdmin);
router.post('/:id/reply', protect, can('reviews.manage'), replyReview);

module.exports = router;
