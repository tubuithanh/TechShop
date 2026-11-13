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
const { protect, authorize, can } = require('../middlewares/authMiddleware');

router.get('/active', getActiveVouchers);
router.post('/validate', protect, validateVoucher);
router.get('/mine', protect, require('../controllers/voucherController').myVouchers);
router.get('/suggest', protect, require('../controllers/voucherController').suggestForCart);
router.get('/', protect, can('vouchers.view'), getVouchers);
router.post('/', protect, authorize('admin'), createVoucher);
router.put('/:id', protect, authorize('admin'), updateVoucher);
router.delete('/:id', protect, authorize('admin'), deleteVoucher);

module.exports = router;
