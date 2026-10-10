const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const chat = require('../controllers/chatController');
const files = require('../controllers/chatAttachmentController');
const { protect, can } = require('../middlewares/authMiddleware');
const startLimiter = rateLimit({ windowMs: 15 * 60000, max: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { message: 'Bạn tạo quá nhiều cuộc chat, vui lòng thử lại sau' } });
const messageLimiter = rateLimit({ windowMs: 60000, max: 40, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { message: 'Bạn gửi quá nhanh, vui lòng chờ một chút' } });
router.get('/availability', chat.availability);
router.post('/guest/start', startLimiter, chat.startChat);
router.get('/guest/session', chat.getGuestSession);
router.get('/guest/messages', chat.getGuestHistory);
router.post('/guest/messages', messageLimiter, chat.sendGuestMessage);
router.post('/guest/read', chat.readGuest);
router.post('/guest/rating', messageLimiter, chat.rateConversation);
router.post('/guest/attachments', messageLimiter, files.authorizeUpload(true), files.parseUpload, files.upload(true));
router.get('/guest/attachments/:attachmentId', files.download(true));
router.use(protect, can('chat.support'));
router.get('/', chat.getConversations);
router.post('/:conversationId/claim', chat.claimConversation);
router.patch('/:conversationId', chat.updateConversation);
router.get('/:conversationId/messages', chat.getChatHistory);
router.post('/:conversationId/messages', messageLimiter, chat.sendStaffMessage);
router.post('/:conversationId/read', chat.readStaff);
router.post('/:conversationId/attachments', messageLimiter, files.authorizeUpload(false), files.parseUpload, files.upload(false));
router.get('/:conversationId/attachments/:attachmentId', files.download(false));
router.get('/:conversationId', chat.getChatHistory);
module.exports = router;
