const express = require('express');
const router = express.Router();
const { getMyNotifications, markAsRead, markAllAsRead } = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/', getMyNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);

module.exports = router;
