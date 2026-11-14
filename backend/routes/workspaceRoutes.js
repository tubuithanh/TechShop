const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');
const { getWorkspace } = require('../controllers/workspaceController');

// Dashboard theo vị trí - mọi tài khoản quản trị / nhân viên (nội dung tự lọc theo vai trò + chi nhánh)
router.get('/', protect, authorize('admin', 'staff'), getWorkspace);

module.exports = router;
