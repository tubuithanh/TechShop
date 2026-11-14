// routes/staffReportRoutes.js - báo cáo nhân viên, gắn tại /api/staff-reports
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');
const { teamReport, myReport, staffReport } = require('../controllers/staffReportController');
const { mySales, staffSales, setTarget } = require('../controllers/salesInsightsController');

// Báo cáo nhân viên: quản lý xem cả đội / từng người; nhân viên xem báo cáo của mình
router.use(protect, authorize('admin', 'staff'));
router.get('/me', myReport); // báo cáo của tôi
router.get('/me/sales', mySales); // phân tích bán hàng chi tiết của tôi
router.get('/team', teamReport); // cả đội
router.get('/staff/:id', staffReport); // 1 nhân viên
router.get('/staff/:id/sales', staffSales); // phân tích bán hàng của 1 nhân viên
router.put('/staff/:id/target', setTarget); // đặt chỉ tiêu tháng (admin / quản lý)

module.exports = router;
