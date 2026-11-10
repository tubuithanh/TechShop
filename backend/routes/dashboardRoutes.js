const express = require('express');
const router = express.Router();
const {
  getSummary,
  getRevenueByDay,
  getRevenueByMonth,
  getBestSellingProducts,
  getOrderStatusStats,
  getRevenueByStore
} = require('../controllers/dashboardController');
const { getAnalytics } = require('../controllers/analyticsController');
const { protect, can } = require('../middlewares/authMiddleware');

router.use(protect, can('dashboard.view'));
router.get('/summary', getSummary);
router.get('/revenue-by-day', getRevenueByDay);
router.get('/revenue-by-month', getRevenueByMonth);
router.get('/best-selling-products', getBestSellingProducts);
router.get('/order-status-stats', getOrderStatusStats);
router.get('/revenue-by-store', getRevenueByStore);
// Trang Phân tích: ?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=...
router.get('/analytics', getAnalytics);

module.exports = router;
