const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const {
  getMailConfig,
  updateMailConfig,
  testMailConfig,
  startGmailConnect,
  gmailCallback,
  disconnectGmail
} = require('../controllers/mailConfigController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Cấu hình email (có mật khẩu SMTP/API key) - CHỈ admin, tách khỏi GET / vốn là API công khai
router.get('/mail', protect, authorize('admin'), getMailConfig);
router.put('/mail', protect, authorize('admin'), updateMailConfig);
router.post('/mail/test', protect, authorize('admin'), testMailConfig);
router.post('/mail/gmail/connect', protect, authorize('admin'), startGmailConnect);
router.post('/mail/gmail/disconnect', protect, authorize('admin'), disconnectGmail);
// Google chuyển trình duyệt về đây - không có token đăng nhập, xác thực bằng "state" đã ký (xem controller)
router.get('/mail/gmail/callback', gmailCallback);

router.get('/', getSettings);
router.put('/', protect, authorize('admin'), updateSettings);

module.exports = router;
