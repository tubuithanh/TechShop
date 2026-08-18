const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.post('/', createOrder);
router.get('/', getMyOrders);
router.get('/admin/all', authorize('admin', 'staff'), getAllOrders);
router.get('/:id', getOrderById);
router.put('/:id/cancel', cancelOrder);
router.put('/:id/status', authorize('admin', 'staff'), updateOrderStatus);

module.exports = router;
