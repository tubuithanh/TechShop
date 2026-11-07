const express = require('express');
const router = express.Router();
const {
  getSummary,
  getRevenueByDay,
  getBestSellingProducts,
  getOrderStatusStats,
  getRevenueByStore
} = require('../controllers/dashboardController');
const { protect, can } = require('../middlewares/authMiddleware');

router.use(protect, can('dashboard.view'));
router.get('/summary', getSummary);
router.get('/revenue-by-day', getRevenueByDay);
router.get('/best-selling-products', getBestSellingProducts);
router.get('/order-status-stats', getOrderStatusStats);
router.get('/revenue-by-store', getRevenueByStore);

module.exports = router;
