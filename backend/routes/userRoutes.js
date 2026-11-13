const express = require('express');
const router = express.Router();
const {
  getLoyalty,
  toggleWishlist,
  getWishlist,
  updateProfile,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  getAllCustomers,
  toggleCustomerActive
} = require('../controllers/userController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');

router.use(protect);
// Chức năng của khách hàng: tài khoản quản trị gọi vào trước đây gây lỗi 500 (không có bản ghi User)
const customer = authorize('customer');
router.get('/loyalty', customer, getLoyalty);
// Khách gộp đơn đã mua tại cửa hàng vào tài khoản: nhập mã đơn trên hóa đơn (SĐT trên đơn phải trùng SĐT tài khoản)
const { claimPosHistory } = require('../utils/posCustomer');
const User = require('../models/User');
router.post('/claim-pos-order', customer, async (req, res, next) => {
  try {
    const user = await User.findById(req.account._id).select('phoneNumber');
    const out = await claimPosHistory(user, req.body.orderCode);
    if (out.status !== 200) return res.status(out.status).json({ message: out.message });
    res.json({ data: out.data });
  } catch (err) { next(err); }
});
router.get('/wishlist', customer, getWishlist);
router.post('/wishlist/:productId', customer, toggleWishlist);
router.put('/profile', customer, updateProfile);
router.post('/addresses', customer, addAddress);
router.put('/addresses/:addressId', customer, updateAddress);
router.put('/addresses/:addressId/default', customer, setDefaultAddress);
router.delete('/addresses/:addressId', customer, deleteAddress);

// Admin - quản lý khách hàng (mục 1.2.3)
router.get('/admin/all', can('customers.view'), getAllCustomers);
router.put('/admin/:id/toggle-active', authorize('admin'), toggleCustomerActive);

module.exports = router;
