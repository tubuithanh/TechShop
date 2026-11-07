const express = require('express');
const router = express.Router();
const { getAuditLogs, deleteAllAuditLogs } = require('../controllers/auditLogController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Chỉ admin mới được xem nhật ký thao tác toàn hệ thống (mục 1.2.0)
router.get('/', protect, authorize('admin'), getAuditLogs);
router.delete('/', protect, authorize('admin'), deleteAllAuditLogs);

module.exports = router;
