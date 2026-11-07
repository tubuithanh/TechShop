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
const evidence = require('../controllers/deliveryEvidenceController');
const { uploadLimiter } = require('../middlewares/rateLimits');
router.post('/:orderId/evidence', can('deliveries.perform'), evidence.load, uploadLimiter, evidence.parse, evidence.save);
// Nhân viên giao hàng
router.get('/mine', can('deliveries.perform'), getMyDeliveries);
router.post('/:orderId/pickup', can('deliveries.perform'), pickUp);
router.post('/:orderId/result', can('deliveries.perform'), reportResult);
// Quản lý chi nhánh
router.get('/', can('deliveries.manage'), getDeliveries);
router.get('/shippers', can('deliveries.manage'), getShippers);
router.post('/:orderId/receive-return', can('deliveries.manage'), (req, res, next) => { req.params.id = req.params.orderId; next(); }, require('../controllers/fulfillmentController').receiveReturn);
router.put('/:orderId/assign', can('deliveries.manage'), assignShipper);
router.post('/:orderId/settle-cod', can('deliveries.manage'), settleCod);

module.exports = router;
