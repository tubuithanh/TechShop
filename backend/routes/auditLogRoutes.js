const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Chỉ admin mới được xem nhật ký thao tác toàn hệ thống (mục 1.2.0)
router.get('/', protect, authorize('admin'), getAuditLogs);

module.exports = router;
