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

// Trước đây route này công khai hoàn toàn (không protect) - nhưng đây là danh sách tồn kho DÙNG
// CHO TRANG QUẢN TRỊ (không có nơi nào ở storefront gọi tới), và cần biết CHÍNH XÁC ai đang gọi để
// áp dụng giới hạn theo chi nhánh (staff được gán storeId cụ thể) - nên thêm protect ở đây. Không
// gắn thêm can(...) vì route KHÔNG có quyền cụ thể trong danh mục (chỉ cần đăng nhập là xem được).
router.get('/', protect, getInventories);
router.get('/check', checkStock);
router.get('/low-stock', protect, can('inventory.manage'), getLowStockAlerts);
router.post('/', protect, can('inventory.manage'), upsertInventory);
router.put('/:id', protect, can('inventory.manage'), updateInventory);

module.exports = router;
