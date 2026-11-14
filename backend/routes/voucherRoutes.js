// routes/voucherRoutes.js - URL mã giảm giá, gắn tại /api/vouchers
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

router.get('/active', getActiveVouchers); // công khai: mã đang áp dụng
router.post('/validate', protect, validateVoucher); // khách kiểm tra mã
router.get('/mine', protect, require('../controllers/voucherController').myVouchers); // ví voucher của khách
router.get('/suggest', protect, require('../controllers/voucherController').suggestForCart); // top 3 mã cho giỏ
router.get('/', protect, can('vouchers.view'), getVouchers); // quản trị: danh sách (nhân viên có quyền xem)
router.post('/', protect, authorize('admin'), createVoucher); // chỉ admin tạo
router.put('/:id', protect, authorize('admin'), updateVoucher); // chỉ admin sửa
router.delete('/:id', protect, authorize('admin'), deleteVoucher); // chỉ admin vô hiệu hóa

module.exports = router;
