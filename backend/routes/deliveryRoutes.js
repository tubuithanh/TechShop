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
const shipments = require('../controllers/shipmentController'); // vận đơn GHN thật
const simulated = require('../controllers/simulatedShipmentController'); // vận đơn giả lập
router.get('/track/:code', simulated.publicTracking); // công khai: tra cứu vận đơn
router.get('/track/:code/photos/:evidenceId', simulated.publicPhoto); // công khai: ảnh giao hàng
router.use(protect); // các URL bên dưới cần đăng nhập
router.get('/locations/:kind', can('deliveries.manage'), shipments.locations); // danh sách tỉnh / quận / phường của GHN
router.get('/:orderId/tracking', shipments.tracking); // hành trình vận đơn
// Đơn vị giao hàng đang dùng (Admin -> Đơn vị giao hàng, hoặc SHIPPING_PROVIDER) quyết định controller xử lý
const { isGhnActive } = require('../utils/shippingConfig');
const byProvider = (action) => async (req, res, next) => { // chọn controller GHN hoặc giả lập theo cấu hình hiện hành
  try { (await isGhnActive() ? shipments : simulated)[action](req, res, next); } catch (err) { next(err); }
};
router.put('/:orderId/plan', can('deliveries.manage'), byProvider('prepare')); // tính phương án giao (tự giao / vận chuyển)
router.post('/:orderId/shipment', can('deliveries.manage'), byProvider('create')); // tạo vận đơn
router.post('/:orderId/shipment/advance', can('deliveries.manage'), simulated.advance); // giả lập: đẩy vận đơn sang bước tiếp
// Phân công: shop tự giao / đơn vị vận chuyển theo cấu hình (giả lập, GHN sandbox...) - controllers/carrierDispatchController.js
const carriers = require('../controllers/carrierDispatchController'); // chọn đơn vị vận chuyển
router.get('/:orderId/carriers', can('deliveries.manage'), carriers.carrierOptions); // các lựa chọn giao hàng của đơn
router.post('/:orderId/carriers/ghn/fee', can('deliveries.manage'), carriers.ghnFee); // báo giá phí GHN
router.post('/:orderId/dispatch', can('deliveries.manage'), carriers.dispatch); // giao cho đơn vị đã chọn
router.post('/:orderId/shipment/retire-sandbox', can('deliveries.manage'), simulated.retireSandbox); // bỏ vận đơn sandbox cũ
router.post('/:orderId/shipment/sync', can('deliveries.manage'), shipments.sync); // đồng bộ trạng thái từ GHN
router.post('/:orderId/shipment/cancel', can('deliveries.manage'), shipments.cancel); // hủy vận đơn
router.post('/:orderId/shipment/settle', can('deliveries.manage'), shipments.settle); // đối soát COD với đơn vị vận chuyển
const evidence = require('../controllers/deliveryEvidenceController');
const { uploadLimiter } = require('../middlewares/rateLimits');
router.post('/:orderId/shipment/evidence/:stage', can('deliveries.manage'), evidence.loadCarrier, uploadLimiter, evidence.parse, evidence.save); // ảnh bằng chứng của đơn vị vận chuyển
router.post('/:orderId/evidence', can('deliveries.perform'), evidence.load, uploadLimiter, evidence.parse, evidence.save); // shipper tải ảnh bằng chứng
// Nhân viên giao hàng
router.get('/mine', can('deliveries.perform'), getMyDeliveries); // shipper: đơn của tôi
router.post('/:orderId/pickup', can('deliveries.perform'), pickUp); // shipper: đã lấy hàng
router.post('/:orderId/result', can('deliveries.perform'), reportResult); // shipper: kết quả giao
// Quản lý chi nhánh
router.get('/', can('deliveries.manage'), getDeliveries); // quản lý: danh sách theo tab
router.get('/shippers', can('deliveries.manage'), getShippers); // quản lý: shipper chọn được
router.get('/board', can('deliveries.manage'), require('../controllers/deliveryController').getBoard); // quản lý: bảng điều phối
router.post('/:orderId/receive-return', can('deliveries.manage'), (req, res, next) => { req.params.id = req.params.orderId; next(); }, require('../controllers/fulfillmentController').receiveReturn); // nhận hàng hoàn (đổi tên tham số cho controller dùng chung)
router.put('/:orderId/assign', can('deliveries.manage'), assignShipper); // phân công shipper
router.post('/:orderId/settle-cod', can('deliveries.manage'), settleCod); // nhận tiền COD từ shipper

module.exports = router;
