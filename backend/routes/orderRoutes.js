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
const { protect, can } = require('../middlewares/authMiddleware');

router.use(protect);
router.post('/', createOrder);
router.get('/', getMyOrders);
router.get('/admin/all', can('orders.manage'), getAllOrders);
router.get('/:id', getOrderById);
router.put('/:id/cancel', cancelOrder);
router.put('/:id/status', can('orders.manage'), updateOrderStatus);

module.exports = router;
