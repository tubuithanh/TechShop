const express = require('express');
const router = express.Router();
const { protect, can } = require('../middlewares/authMiddleware');
const c = require('../controllers/einvoiceController');

// Hóa đơn điện tử giả lập: tra cứu công khai bằng mã; khách xem hóa đơn của đơn mình; nhân viên quản lý đơn phát hành / hủy / thay thế
router.get('/lookup/:code', c.lookup); // công khai
router.use(protect); // bên dưới cần đăng nhập
router.get('/by-order/:orderId', c.byOrder); // khách / nhân viên (kiểm tra trong controller)
router.get('/', can('orders.manage'), c.list); // danh sách hóa đơn
router.post('/bulk-issue', can('orders.manage'), c.bulkIssue); // phát hành hàng loạt
router.get('/pending-orders', can('orders.manage'), c.pendingOrders); // đơn chờ xuất
router.post('/orders/:orderId/preview', can('orders.manage'), c.preview); // xem trước
router.post('/orders/:orderId/issue', can('orders.manage'), c.issue); // phát hành
router.get('/:id', can('orders.manage'), c.getOne); // chi tiết
router.post('/:id/email', can('orders.manage'), c.email); // gửi lại email
router.post('/:id/cancel', can('orders.manage'), c.cancel); // hủy
router.post('/:id/replace', can('orders.manage'), c.replace); // thay thế

module.exports = router;
