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
const { getPaymentConfig, updatePaymentConfig, testPaymentConfig } = require('../controllers/paymentConfigController');
const {
  getThemeTemplates,
  createThemeTemplate,
  updateThemeTemplate,
  deleteThemeTemplate
} = require('../controllers/themeController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Cấu hình email (có mật khẩu SMTP/API key) - CHỈ admin, tách khỏi GET / vốn là API công khai
router.get('/mail', protect, authorize('admin'), getMailConfig);
router.put('/mail', protect, authorize('admin'), updateMailConfig);
router.post('/mail/test', protect, authorize('admin'), testMailConfig);
router.post('/mail/gmail/connect', protect, authorize('admin'), startGmailConnect);
router.post('/mail/gmail/disconnect', protect, authorize('admin'), disconnectGmail);
// Google chuyển trình duyệt về đây - không có token đăng nhập, xác thực bằng "state" đã ký (xem controller)
router.get('/mail/gmail/callback', gmailCallback);

// Cấu hình thanh toán VNPay (có Secret Key) - CHỈ admin
router.get('/payment', protect, authorize('admin'), getPaymentConfig);
router.put('/payment', protect, authorize('admin'), updatePaymentConfig);
router.post('/payment/test', protect, authorize('admin'), testPaymentConfig);

// Template màu sắc giao diện - CHỈ admin
router.get('/themes', protect, authorize('admin'), getThemeTemplates);
router.post('/themes', protect, authorize('admin'), createThemeTemplate);
router.put('/themes/:id', protect, authorize('admin'), updateThemeTemplate);
router.delete('/themes/:id', protect, authorize('admin'), deleteThemeTemplate);

router.get('/', getSettings);
router.put('/', protect, authorize('admin'), updateSettings);

module.exports = router;
