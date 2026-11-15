const express = require('express');
const router = express.Router();
const { protect, canAny } = require('../middlewares/authMiddleware');
// Hóa đơn: nhân viên quản lý đơn HOẶC kế toán (einvoices.manage)
const einv = canAny('orders.manage', 'einvoices.manage');
const c = require('../controllers/einvoiceController');

// Hóa đơn điện tử giả lập: tra cứu công khai bằng mã; khách xem hóa đơn của đơn mình; nhân viên quản lý đơn phát hành / hủy / thay thế
router.get('/lookup/:code', c.lookup); // công khai
router.use(protect); // bên dưới cần đăng nhập
router.get('/by-order/:orderId', c.byOrder); // khách / nhân viên (kiểm tra trong controller)
router.get('/', einv, c.list); // danh sách hóa đơn
router.post('/bulk-issue', einv, c.bulkIssue); // phát hành hàng loạt
router.get('/pending-orders', einv, c.pendingOrders); // đơn chờ xuất
router.post('/orders/:orderId/preview', einv, c.preview); // xem trước
router.post('/orders/:orderId/issue', einv, c.issue); // phát hành
router.get('/:id', einv, c.getOne); // chi tiết
router.post('/:id/email', einv, c.email); // gửi lại email
router.post('/:id/cancel', einv, c.cancel); // hủy
router.post('/:id/replace', einv, c.replace); // thay thế

module.exports = router;
