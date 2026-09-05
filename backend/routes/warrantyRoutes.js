const express = require('express');
const router = express.Router();
const {
  createWarrantyRequest,
  getMyWarranties,
  trackWarranty,
  submitWarrantyFeedback,
  getAllWarranties,
  updateWarrantyStatus,
  updateWarranty
} = require('../controllers/warrantyController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/track/:code', trackWarranty);
router.use(protect);
router.post('/', createWarrantyRequest);
router.get('/', getMyWarranties);
router.put('/:id/feedback', submitWarrantyFeedback);

router.get('/admin/all', authorize('admin', 'staff'), getAllWarranties);
router.put('/:id/status', authorize('admin', 'staff'), updateWarrantyStatus);
router.put('/:id', authorize('admin', 'staff'), updateWarranty);

module.exports = router;
