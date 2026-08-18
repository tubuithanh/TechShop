const express = require('express');
const router = express.Router();
const { hideReview, replyReview, getAllReviewsAdmin } = require('../controllers/reviewController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/admin/all', protect, authorize('admin', 'staff'), getAllReviewsAdmin);
router.put('/:id/hide', protect, authorize('admin', 'staff'), hideReview);
router.post('/:id/reply', protect, authorize('admin', 'staff'), replyReview);

module.exports = router;
