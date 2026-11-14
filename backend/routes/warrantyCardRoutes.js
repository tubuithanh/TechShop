const express = require('express');
const router = express.Router();
const c = require('../controllers/warrantyCardController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');
const { quoteLimiter } = require('../middlewares/rateLimits');

// Công khai: kiểm tra còn bảo hành (cần SĐT mua hàng) - giới hạn tần suất để chống dò mã
router.get('/lookup', quoteLimiter, c.lookup); // công khai, giới hạn tần suất

router.use(protect); // bên dưới cần đăng nhập

// Quản trị - đặt TRƯỚC các route '/:id' để "admin" không bị hiểu là id
router.get('/admin/plans', authorize('admin'), c.listPlans); // gói gia hạn (admin)
router.post('/admin/plans', authorize('admin'), c.createPlan); // tạo gói
router.put('/admin/plans/:id', authorize('admin'), c.updatePlan); // sửa gói
router.put('/admin/brands/:brandId/center', authorize('admin'), c.updateBrandWarrantyCenter); // trung tâm bảo hành hãng
router.get('/admin', can('warranties.manage'), c.adminList); // danh sách sổ
router.put('/admin/:id', can('warranties.manage'), c.adminUpdate); // nhập IMEI
router.get('/admin/:id/plans', can('warranties.manage'), c.adminPlans); // gói bán được cho sổ
router.post('/admin/:id/extensions', can('warranties.manage'), c.adminSellExtension); // bán gói tại quầy
router.post('/admin/:id/extensions/:extId/confirm', can('warranties.manage'), c.adminConfirmExtension); // xác nhận đã thu tiền
router.post('/admin/:id/extensions/:extId/cancel', can('warranties.manage'), c.adminCancelExtension); // hủy gói chờ

// Khách hàng
router.get('/mine', authorize('customer'), c.getMine); // sổ của tôi
router.post('/:id/activate', authorize('customer'), c.activate); // kích hoạt
router.get('/:id/plans', authorize('customer'), c.getPlans); // gói mua được
router.post('/:id/extensions', authorize('customer'), c.requestExtension); // đăng ký mua gói
router.delete('/:id/extensions/:extId', authorize('customer'), c.cancelMyExtension); // hủy gói chưa trả tiền

module.exports = router;
