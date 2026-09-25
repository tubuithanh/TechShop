const express = require('express');
const router = express.Router();
const { getCatalog, getGroups, createGroup, updateGroup, deleteGroup } = require('../controllers/permissionGroupController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Quản lý nhóm quyền là thao tác cấu trúc nhạy cảm - CHỈ admin, không thể cấp quyền này cho staff
// (nếu không, 1 staff có thể tự cấp thêm quyền cho chính mình).
router.get('/catalog', protect, authorize('admin', 'staff'), getCatalog);
router.get('/', protect, authorize('admin'), getGroups);
router.post('/', protect, authorize('admin'), createGroup);
router.put('/:id', protect, authorize('admin'), updateGroup);
router.delete('/:id', protect, authorize('admin'), deleteGroup);

module.exports = router;
