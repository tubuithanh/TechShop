const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  getSecuritySettings,
  updateSecuritySettings,
  getLoyaltySettings,
  previewLoyaltyTiers,
  updateLoyaltySettings
} = require('../controllers/settingController');
const {
  getMailConfig,
  updateMailConfig,
  testMailConfig,
  startGmailConnect,
  gmailCallback,
  disconnectGmail
} = require('../controllers/mailConfigController');
const { getPaymentConfig, updatePaymentConfig, testPaymentConfig } = require('../controllers/paymentConfigController');
const { getMomoConfig, updateMomoConfig, testMomoConfig } = require('../controllers/momoConfigController');
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
// Cấu hình thanh toán MoMo (có Secret Key) - CHỈ admin
router.get('/payment/momo', protect, authorize('admin'), getMomoConfig);
router.put('/payment/momo', protect, authorize('admin'), updateMomoConfig);
router.post('/payment/momo/test', protect, authorize('admin'), testMomoConfig);
// Đơn vị giao hàng (giả lập / Giao Hàng Nhanh / ... - có token bí mật) - CHỈ admin
const shippingCfg = require('../controllers/shippingConfigController');
router.get('/shipping', protect, authorize('admin'), shippingCfg.getShippingConfig);
router.put('/shipping', protect, authorize('admin'), shippingCfg.updateShippingConfig);
router.post('/shipping/test', protect, authorize('admin'), shippingCfg.testShippingConfig);
// Hóa đơn điện tử (giả lập mặc định / Bkav eHoadon / ...) - CHỈ admin
const demoAcc = require('../controllers/demoAccountsController');
router.get('/demo-accounts', protect, authorize('admin'), demoAcc.getDemoSetting);
router.put('/demo-accounts', protect, authorize('admin'), demoAcc.updateDemoSetting);
const einvoiceCfg = require('../controllers/einvoiceConfigController');
router.get('/einvoice', protect, authorize('admin'), einvoiceCfg.getConfig);
router.put('/einvoice', protect, authorize('admin'), einvoiceCfg.updateConfig);
router.post('/einvoice/test', protect, authorize('admin'), einvoiceCfg.testConfig);

// Template màu sắc giao diện - CHỈ admin
router.get('/themes', protect, authorize('admin'), getThemeTemplates);
router.post('/themes', protect, authorize('admin'), createThemeTemplate);
router.put('/themes/:id', protect, authorize('admin'), updateThemeTemplate);
router.delete('/themes/:id', protect, authorize('admin'), deleteThemeTemplate);

// Bảo mật: bật/tắt chống lạm dụng & tấn công dồn dập - CHỈ admin
router.get('/security', protect, authorize('admin'), getSecuritySettings);
router.put('/security', protect, authorize('admin'), updateSecuritySettings);

router.get('/loyalty', protect, authorize('admin'), getLoyaltySettings);
router.put('/loyalty', protect, authorize('admin'), updateLoyaltySettings);
router.post('/loyalty/preview', protect, authorize('admin'), previewLoyaltyTiers);

router.get('/', getSettings);
router.put('/', protect, authorize('admin'), updateSettings);

module.exports = router;
