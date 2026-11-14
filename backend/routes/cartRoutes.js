// routes/cartRoutes.js - URL giỏ hàng, gắn tại /api/cart
const express = require('express');
const router = express.Router();
const { getCart, getCartStores, addItem, updateItem, removeItem, clearCart } = require('../controllers/cartController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Giỏ hàng chỉ của khách hàng: trước đây nhân viên / admin vẫn tạo được giỏ (theo id tài khoản quản trị)
// nhưng tới bước đặt hàng mới bị từ chối
router.use(protect, authorize('customer')); // áp cho MỌI route bên dưới: phải đăng nhập + là khách hàng
router.get('/', getCart); // xem giỏ
router.get('/stores', getCartStores); // chi nhánh nào đủ hàng cho cả giỏ
router.post('/items', addItem); // thêm sản phẩm
router.put('/items/:itemId', updateItem); // đổi số lượng
router.delete('/items/:itemId', removeItem); // xóa 1 dòng
router.delete('/', clearCart); // xóa hết

module.exports = router;
