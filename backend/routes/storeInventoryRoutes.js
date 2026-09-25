const express = require('express');
const router = express.Router();
const {
  getInventories,
  checkStock,
  upsertInventory,
  updateInventory,
  getLowStockAlerts
} = require('../controllers/storeInventoryController');
const { protect, can } = require('../middlewares/authMiddleware');

router.get('/', getInventories);
router.get('/check', checkStock);
router.get('/low-stock', protect, can('inventory.manage'), getLowStockAlerts);
router.post('/', protect, can('inventory.manage'), upsertInventory);
router.put('/:id', protect, can('inventory.manage'), updateInventory);

module.exports = router;
