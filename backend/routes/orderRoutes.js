const express = require('express');
const router = express.Router();
const {
  createOrder,
  quoteOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect, can, authorize } = require('../middlewares/authMiddleware');
const { orderLimiter, quoteLimiter } = require('../middlewares/rateLimits');

router.use(protect);
const fulfillment = require('../controllers/fulfillmentController');
const evidence = require('../controllers/deliveryEvidenceController');
const pos = require('../controllers/posController');
const transfers = require('../controllers/orderTransferController');
// Việc cần làm: đơn đang chờ xử lý, xếp theo mức gấp; admin chỉnh ngưỡng quá hạn
const inbox = require('../controllers/orderInboxController');
router.get('/admin/inbox', can('orders.manage'), inbox.getInbox);
router.put('/admin/inbox/sla', authorize('admin'), inbox.updateSla);
router.get('/admin/transfers', can('orders.manage'), transfers.list);
router.post('/admin/transfers/:transferId/decision', can('orders.manage'), transfers.decide);
router.post('/:id/transfer', can('orders.manage'), transfers.request);
router.put('/:id/info', can('orders.manage'), require('../controllers/orderEditController'));
router.get('/pos/catalog', can('orders.pos'), pos.catalog);
router.get('/pos/customers', can('orders.pos'), pos.customers);
router.post('/pos', can('orders.pos'), pos.create);
router.post('/pos/quote', can('orders.pos'), (req, res, next) => { req.posQuote = true; next(); }, pos.create);
router.post('/:id/handover', can('orders.manage'), fulfillment.handover);
router.post('/:id/receive-return', can('orders.manage'), fulfillment.receiveReturn);
router.post('/:id/confirm-payment', can('orders.manage'), fulfillment.confirmPayment);
router.post('/:id/confirm-refund', can('orders.manage'), fulfillment.confirmRefund);
router.get('/:orderId/evidence/:evidenceId', evidence.load, evidence.download);
router.post('/quote', quoteLimiter, quoteOrder);
router.post('/', orderLimiter, createOrder);
router.get('/', getMyOrders);
router.get('/admin/all', can('orders.manage'), getAllOrders);
router.get('/:id', getOrderById);
router.put('/:id/cancel', cancelOrder);
router.put('/:id/status', can('orders.manage'), updateOrderStatus);

module.exports = router;
