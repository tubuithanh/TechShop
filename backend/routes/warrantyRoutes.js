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
router.get('/admin/order', can('warranties.manage'), require('../utils/asyncHandler')(async (req, res) => {
  const order = await require('../models/Order').findOne({ orderCode: String(req.query.code || '').trim(), status: 'delivered' }).select('orderCode items deliveryAddress storeId');
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn đã bàn giao' });
  if (!require('../controllers/orderController').inScope(req, order)) return res.status(403).json({ message: 'Đơn thuộc chi nhánh khác' });
  res.json({ data: order });
}));
router.post('/', createWarrantyRequest);
router.get('/', getMyWarranties);
router.put('/:id/feedback', submitWarrantyFeedback);

router.get('/admin/all', can('warranties.manage'), getAllWarranties);
router.put('/:id/status', can('warranties.manage'), updateWarrantyStatus);
router.put('/:id', can('warranties.manage'), updateWarranty);

module.exports = router;
