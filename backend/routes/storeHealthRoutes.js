const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');
const { getStoreHealth } = require('../controllers/storeHealthController');

// Báo cáo sức khỏe chi nhánh / TechShop: admin (mọi chi nhánh), quản lý (chi nhánh mình quản lý) - kiểm tra trong controller
router.get('/', protect, authorize('admin', 'staff'), getStoreHealth);

module.exports = router;
