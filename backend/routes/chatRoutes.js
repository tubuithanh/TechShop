const express = require('express');
const router = express.Router();
const { getChatHistory, getConversations, getSupportAgent } = require('../controllers/chatController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/support-agent', getSupportAgent);
router.get('/', authorize('admin', 'staff'), getConversations);
router.get('/:conversationId', getChatHistory);

module.exports = router;
