const express = require('express');
const router = express.Router();
const { getStaffList, createStaff, updateStaff, deleteStaff } = require('../controllers/staffController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Quản lý tài khoản admin/staff là thao tác cấu trúc nhạy cảm - CHỈ admin (staff không được tự
// tạo/sửa tài khoản quản trị khác, kể cả tài khoản staff khác).
router.use(protect, authorize('admin'));
router.get('/', getStaffList);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.delete('/:id', deleteStaff);

module.exports = router;
