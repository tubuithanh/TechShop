const express = require('express');
const router = express.Router();
const {
  toggleWishlist,
  getWishlist,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  getAllCustomers,
  toggleCustomerActive
} = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/wishlist', getWishlist);
router.post('/wishlist/:productId', toggleWishlist);
router.put('/profile', updateProfile);
router.post('/addresses', addAddress);
router.put('/addresses/:addressId', updateAddress);
router.delete('/addresses/:addressId', deleteAddress);

// Admin - quản lý khách hàng (mục 1.2.3)
router.get('/admin/all', authorize('admin', 'staff'), getAllCustomers);
router.put('/admin/:id/toggle-active', authorize('admin'), toggleCustomerActive);

module.exports = router;
