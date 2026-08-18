const express = require('express');
const router = express.Router();
const { getCart, addItem, updateItem, removeItem, clearCart } = require('../controllers/cartController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/', getCart);
router.post('/items', addItem);
router.put('/items/:itemId', updateItem);
router.delete('/items/:itemId', removeItem);
router.delete('/', clearCart);

module.exports = router;
