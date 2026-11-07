const express = require('express');
const router = express.Router();
const c = require('../controllers/locationController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Công khai - form địa chỉ (đăng ký, thanh toán, sổ địa chỉ)
router.get('/provinces', c.getProvinces);
router.get('/wards', c.getWards);

// Quản trị - chỉ admin
const admin = [protect, authorize('admin')];
router.get('/admin/provinces', admin, c.adminGetProvinces);
router.post('/admin/provinces', admin, c.createProvince);
router.put('/admin/provinces/:id', admin, c.updateProvince);
router.delete('/admin/provinces/:id', admin, c.deleteProvince);
router.get('/admin/wards', admin, c.adminGetWards);
router.post('/admin/wards', admin, c.createWard);
router.put('/admin/wards/:id', admin, c.updateWard);
router.delete('/admin/wards/:id', admin, c.deleteWard);
router.post('/admin/seed-default', admin, c.seedDefault);

module.exports = router;
