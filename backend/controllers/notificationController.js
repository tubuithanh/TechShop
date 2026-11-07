const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

const getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.account._id }).sort({ createdAt: -1 }).limit(50);
  const unreadCount = await Notification.countDocuments({ userId: req.account._id, isRead: false });
  res.json({ data: notifications, unreadCount });
});

const markAsRead = asyncHandler(async (req, res) => {
  const noti = await Notification.findOne({ _id: req.params.id, userId: req.account._id });
  if (!noti) return res.status(404).json({ message: 'Không tìm thấy thông báo' });
  noti.isRead = true;
  await noti.save();
  res.json({ data: noti });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.account._id, isRead: false }, { isRead: true });
  res.json({ message: 'Đã đánh dấu tất cả đã đọc' });
});

module.exports = { getMyNotifications, markAsRead, markAllAsRead };
