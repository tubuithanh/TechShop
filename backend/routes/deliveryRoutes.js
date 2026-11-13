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
const shipments = require('../controllers/shipmentController');
const simulated = require('../controllers/simulatedShipmentController');
router.get('/track/:code', simulated.publicTracking);
router.get('/track/:code/photos/:evidenceId', simulated.publicPhoto);
router.use(protect);
router.get('/locations/:kind', can('deliveries.manage'), shipments.locations);
router.get('/:orderId/tracking', shipments.tracking);
// Đơn vị giao hàng đang dùng (Admin -> Đơn vị giao hàng, hoặc SHIPPING_PROVIDER) quyết định controller xử lý
const { isGhnActive } = require('../utils/shippingConfig');
const byProvider = (action) => async (req, res, next) => {
  try { (await isGhnActive() ? shipments : simulated)[action](req, res, next); } catch (err) { next(err); }
};
router.put('/:orderId/plan', can('deliveries.manage'), byProvider('prepare'));
router.post('/:orderId/shipment', can('deliveries.manage'), byProvider('create'));
router.post('/:orderId/shipment/advance', can('deliveries.manage'), simulated.advance);
// Phân công: shop tự giao / đơn vị vận chuyển theo cấu hình (giả lập, GHN sandbox...) - controllers/carrierDispatchController.js
const carriers = require('../controllers/carrierDispatchController');
router.get('/:orderId/carriers', can('deliveries.manage'), carriers.carrierOptions);
router.post('/:orderId/carriers/ghn/fee', can('deliveries.manage'), carriers.ghnFee);
router.post('/:orderId/dispatch', can('deliveries.manage'), carriers.dispatch);
router.post('/:orderId/shipment/retire-sandbox', can('deliveries.manage'), simulated.retireSandbox);
router.post('/:orderId/shipment/sync', can('deliveries.manage'), shipments.sync);
router.post('/:orderId/shipment/cancel', can('deliveries.manage'), shipments.cancel);
router.post('/:orderId/shipment/settle', can('deliveries.manage'), shipments.settle);
const evidence = require('../controllers/deliveryEvidenceController');
const { uploadLimiter } = require('../middlewares/rateLimits');
router.post('/:orderId/shipment/evidence/:stage', can('deliveries.manage'), evidence.loadCarrier, uploadLimiter, evidence.parse, evidence.save);
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
