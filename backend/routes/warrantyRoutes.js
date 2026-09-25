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
const { protect, can } = require('../middlewares/authMiddleware');

router.get('/track/:code', trackWarranty);
router.use(protect);
router.post('/', createWarrantyRequest);
router.get('/', getMyWarranties);
router.put('/:id/feedback', submitWarrantyFeedback);

router.get('/admin/all', can('warranties.manage'), getAllWarranties);
router.put('/:id/status', can('warranties.manage'), updateWarrantyStatus);
router.put('/:id', can('warranties.manage'), updateWarranty);

module.exports = router;
