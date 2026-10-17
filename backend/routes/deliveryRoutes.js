const express = require('express');
const router = express.Router();
const { protect, can } = require('../middlewares/authMiddleware');
const {
  getDeliveries,
  getShippers,
  assignShipper,
  getMyDeliveries,
  pickUp,
  reportResult,
  settleCod
} = require('../controllers/deliveryController');

// Giao nhận hàng (UC37 – UC40)
router.use(protect);
// Nhân viên giao hàng
router.get('/mine', can('deliveries.perform'), getMyDeliveries);
router.post('/:orderId/pickup', can('deliveries.perform'), pickUp);
router.post('/:orderId/result', can('deliveries.perform'), reportResult);
// Quản lý chi nhánh
router.get('/', can('deliveries.manage'), getDeliveries);
router.get('/shippers', can('deliveries.manage'), getShippers);
router.put('/:orderId/assign', can('deliveries.manage'), assignShipper);
router.post('/:orderId/settle-cod', can('deliveries.manage'), settleCod);

module.exports = router;
