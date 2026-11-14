const express = require('express');
const router = express.Router();
const { getStaffList, createStaff, updateStaff, deleteStaff } = require('../controllers/staffController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Quản lý tài khoản admin/staff là thao tác cấu trúc nhạy cảm - CHỈ admin (staff không được tự
// tạo/sửa tài khoản quản trị khác, kể cả tài khoản staff khác).
const work = require('../controllers/staffWorkController');

// Nhân viên xem các chi nhánh mình được thao tác (ô chọn "chi nhánh đang làm việc") - mọi nhân viên
router.get('/me/stores', protect, authorize('admin', 'staff'), work.myStores);

router.use(protect, authorize('admin'));
// Thêm / sửa / xóa nhân viên -> làm mới danh sách tài khoản demo ở trang đăng nhập
router.use((req, res, next) => { if (req.method !== 'GET') require('../controllers/demoAccountsController').clearDemoCache(); next(); });
router.get('/performance/summary', work.performanceSummary);
router.get('/by-store/:storeId', work.storeStaff);
router.post('/by-store/:storeId', work.addStaffToStore);
router.delete('/by-store/:storeId/:staffId', work.removeStaffFromStore);
router.get('/:id/assignments', work.listAssignments);
router.post('/:id/transfers', work.createTransfer);
router.post('/:id/transfers/:aid/end', work.endTransfer);
router.get('/:id/performance', work.performance);
router.put('/:id/reviews/:year', work.saveReview);
router.get('/', getStaffList);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.delete('/:id', deleteStaff);

module.exports = router;
