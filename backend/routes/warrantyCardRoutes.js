const express = require('express');
const router = express.Router();
const c = require('../controllers/warrantyCardController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');
const { quoteLimiter } = require('../middlewares/rateLimits');

// Công khai: kiểm tra còn bảo hành (cần SĐT mua hàng) - giới hạn tần suất để chống dò mã
router.get('/lookup', quoteLimiter, c.lookup);

router.use(protect);

// Quản trị - đặt TRƯỚC các route '/:id' để "admin" không bị hiểu là id
router.get('/admin/plans', authorize('admin'), c.listPlans);
router.post('/admin/plans', authorize('admin'), c.createPlan);
router.put('/admin/plans/:id', authorize('admin'), c.updatePlan);
router.put('/admin/brands/:brandId/center', authorize('admin'), c.updateBrandWarrantyCenter);
router.get('/admin', can('warranties.manage'), c.adminList);
router.put('/admin/:id', can('warranties.manage'), c.adminUpdate);
router.get('/admin/:id/plans', can('warranties.manage'), c.adminPlans);
router.post('/admin/:id/extensions', can('warranties.manage'), c.adminSellExtension);
router.post('/admin/:id/extensions/:extId/confirm', can('warranties.manage'), c.adminConfirmExtension);
router.post('/admin/:id/extensions/:extId/cancel', can('warranties.manage'), c.adminCancelExtension);

// Khách hàng
router.get('/mine', authorize('customer'), c.getMine);
router.post('/:id/activate', authorize('customer'), c.activate);
router.get('/:id/plans', authorize('customer'), c.getPlans);
router.post('/:id/extensions', authorize('customer'), c.requestExtension);
router.delete('/:id/extensions/:extId', authorize('customer'), c.cancelMyExtension);

module.exports = router;
