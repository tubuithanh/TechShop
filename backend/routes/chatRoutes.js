const express = require('express');
const router = express.Router();
const { getChatHistory, getConversations, getSupportAgent } = require('../controllers/chatController');
const { protect, can } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/support-agent', getSupportAgent);
router.get('/', can('chat.support'), getConversations);
router.get('/:conversationId', getChatHistory);

module.exports = router;
