const express = require('express');
const router = express.Router();
const {
  validateVoucher,
  getActiveVouchers,
  getVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher
} = require('../controllers/voucherController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/active', getActiveVouchers);
router.post('/validate', protect, validateVoucher);
router.get('/', protect, authorize('admin', 'staff'), getVouchers);
router.post('/', protect, authorize('admin'), createVoucher);
router.put('/:id', protect, authorize('admin'), updateVoucher);
router.delete('/:id', protect, authorize('admin'), deleteVoucher);

module.exports = router;
