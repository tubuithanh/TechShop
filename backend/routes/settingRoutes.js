const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const { getMailConfig, updateMailConfig, testMailConfig } = require('../controllers/mailConfigController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Cấu hình email (có mật khẩu SMTP/API key) - CHỈ admin, tách khỏi GET / vốn là API công khai
router.get('/mail', protect, authorize('admin'), getMailConfig);
router.put('/mail', protect, authorize('admin'), updateMailConfig);
router.post('/mail/test', protect, authorize('admin'), testMailConfig);

router.get('/', getSettings);
router.put('/', protect, authorize('admin'), updateSettings);

module.exports = router;
