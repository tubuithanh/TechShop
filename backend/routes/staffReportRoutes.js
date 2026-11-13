const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');
const { teamReport, myReport, staffReport } = require('../controllers/staffReportController');

// Báo cáo nhân viên: quản lý xem cả đội / từng người; nhân viên xem báo cáo của mình
router.use(protect, authorize('admin', 'staff'));
router.get('/me', myReport);
router.get('/team', teamReport);
router.get('/staff/:id', staffReport);

module.exports = router;
