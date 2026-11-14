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

router.use(protect); // mọi URL đơn hàng đều cần đăng nhập
const fulfillment = require('../controllers/fulfillmentController'); // bàn giao, nhận hàng trả, xác nhận thanh toán / hoàn tiền
const evidence = require('../controllers/deliveryEvidenceController'); // ảnh bằng chứng giao hàng
const pos = require('../controllers/posController'); // bán tại quầy
const transfers = require('../controllers/orderTransferController'); // điều phối đơn sang chi nhánh khác
// Việc cần làm: đơn đang chờ xử lý, xếp theo mức gấp; admin chỉnh ngưỡng quá hạn
const inbox = require('../controllers/orderInboxController');
router.get('/admin/inbox', can('orders.manage'), inbox.getInbox); // danh sách việc cần làm
router.put('/admin/inbox/sla', authorize('admin'), inbox.updateSla); // admin chỉnh ngưỡng quá hạn
router.get('/admin/transfers', can('orders.manage'), transfers.list); // yêu cầu điều phối
router.post('/admin/transfers/:transferId/decision', can('orders.manage'), transfers.decide); // chấp nhận / từ chối điều phối
router.post('/:id/transfer', can('orders.manage'), transfers.request); // gửi yêu cầu điều phối
router.put('/:id/info', can('orders.manage'), require('../controllers/orderEditController')); // sửa thông tin người nhận / ghi chú
router.get('/pos/catalog', can('orders.pos'), pos.catalog); // POS: danh mục sản phẩm
router.get('/pos/customers', can('orders.pos'), pos.customers); // POS: tìm khách
router.get('/pos/today', can('orders.pos'), pos.today); // POS: doanh số hôm nay
router.get('/pos/lookup-phone', can('orders.pos'), pos.lookup); // POS: tra SĐT khách
router.post('/pos/vouchers', can('orders.pos'), pos.vouchers); // POS: gợi ý mã
router.post('/pos', can('orders.pos'), pos.create); // POS: thanh toán tạo đơn
router.post('/pos/quote', can('orders.pos'), (req, res, next) => { req.posQuote = true; next(); }, pos.create); // POS: tính trước tổng tiền (dùng chung hàm, bật cờ posQuote)
router.post('/:id/handover', can('orders.manage'), fulfillment.handover); // bàn giao cho khách tại cửa hàng
router.post('/:id/receive-return', can('orders.manage'), fulfillment.receiveReturn); // kho nhận hàng trả
router.post('/:id/confirm-payment', can('orders.manage'), fulfillment.confirmPayment); // xác nhận đã nhận chuyển khoản
router.post('/:id/confirm-refund', can('orders.manage'), fulfillment.confirmRefund); // xác nhận đã hoàn tiền
router.get('/:orderId/evidence/:evidenceId', evidence.load, evidence.download); // xem ảnh bằng chứng
router.post('/quote', quoteLimiter, quoteOrder); // khách: xem trước tổng tiền
router.post('/', orderLimiter, createOrder); // khách: đặt hàng
router.get('/', getMyOrders); // khách: đơn của tôi
router.get('/admin/all', can('orders.manage'), getAllOrders); // quản trị: danh sách đơn (đứng TRƯỚC /:id để không bị hiểu "admin" là id)
router.get('/:id', getOrderById); // chi tiết đơn (kiểm tra quyền trong controller)
router.put('/:id/cancel', cancelOrder); // khách tự hủy
router.put('/:id/status', can('orders.manage'), updateOrderStatus); // nhân viên đổi trạng thái

module.exports = router;
