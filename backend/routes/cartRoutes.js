const express = require('express');
const router = express.Router();
const { getCart, getCartStores, addItem, updateItem, removeItem, clearCart } = require('../controllers/cartController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Giỏ hàng chỉ của khách hàng: trước đây nhân viên / admin vẫn tạo được giỏ (theo id tài khoản quản trị)
// nhưng tới bước đặt hàng mới bị từ chối
router.use(protect, authorize('customer'));
router.get('/', getCart);
router.get('/stores', getCartStores);
router.post('/items', addItem);
router.put('/items/:itemId', updateItem);
router.delete('/items/:itemId', removeItem);
router.delete('/', clearCart);

module.exports = router;
