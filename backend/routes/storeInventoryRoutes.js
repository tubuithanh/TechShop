const express = require('express');
const router = express.Router();
const {
  getInventories,
  checkStock,
  upsertInventory,
  updateInventory,
  getLowStockAlerts
} = require('../controllers/storeInventoryController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getInventories);
router.get('/check', checkStock);
router.get('/low-stock', protect, authorize('admin', 'staff'), getLowStockAlerts);
router.post('/', protect, authorize('admin', 'staff'), upsertInventory);
router.put('/:id', protect, authorize('admin', 'staff'), updateInventory);

module.exports = router;
