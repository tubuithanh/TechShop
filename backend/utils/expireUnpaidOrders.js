const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { emailOrderStatus } = require('./notifyEmail');

// Đơn thanh toán online (VNPay/MoMo) chưa thanh toán giữ hàng trong kho - quá hạn thì tự hủy để trả lại tồn kho.
// PAYMENT_TIMEOUT_MINUTES: thời gian chờ thanh toán; LINK_LIFETIME_MINUTES: hạn của 1 link VNPay (utils/vnpay.js).
// Chỉ cho tạo link mới khi còn đủ thời gian để link hết hạn TRƯỚC lúc đơn bị hủy - tránh khách trả tiền cho đơn
// vừa bị hủy.
const PAYMENT_TIMEOUT_MINUTES = Number(process.env.VNPAY_PAYMENT_TIMEOUT_MINUTES) || 30;
const LINK_LIFETIME_MINUTES = 15;
const reasonFor = (mode) => `Quá hạn thanh toán ${Order.PAYMENT_LABELS[mode] || 'online'} (${PAYMENT_TIMEOUT_MINUTES} phút)`;

// Đơn còn được tạo link thanh toán mới không
function canStartPayment(order, now = new Date()) {
  const ageMinutes = (now - new Date(order.createdAt)) / 60000;
  return ageMinutes <= PAYMENT_TIMEOUT_MINUTES - LINK_LIFETIME_MINUTES;
}

// Hủy các đơn VNPay quá hạn chưa thanh toán. restoreStock được truyền vào (nằm trong orderController).
// Trả về số đơn đã hủy.
async function expireUnpaidVnpayOrders({ restoreStock, now = new Date() }) {
  const deadline = new Date(now.getTime() - PAYMENT_TIMEOUT_MINUTES * 60000);
  const candidates = await Order.find({
    paymentMode: { $in: Order.ONLINE_PAYMENT_MODES },
    status: 'pending',
    paymentStatus: { $in: ['pending', 'failed'] },
    createdAt: { $lt: deadline }
  }).select('_id paymentMode');

  let cancelled = 0;
  for (const { _id, paymentMode } of candidates) {
    const REASON = reasonFor(paymentMode);
    // Điều kiện nguyên tử: chỉ hủy nếu đơn VẪN chờ xác nhận và chưa thanh toán (khách có thể vừa trả tiền)
    const order = await Order.findOneAndUpdate(
      { _id, status: 'pending', paymentStatus: { $in: ['pending', 'failed'] } },
      {
        $set: { status: 'cancelled', cancelReason: REASON },
        $push: { statusHistory: { status: 'cancelled', note: REASON } }
      },
      { new: true }
    );
    if (!order) continue;
    cancelled++;
    await restoreStock(order.storeId, order.items);
    await Notification.create({
      userId: order.userId,
      type: 'order',
      title: 'Đơn hàng đã hủy',
      message: `Đơn hàng ${order.orderCode} đã tự hủy do quá hạn thanh toán ${Order.PAYMENT_LABELS[paymentMode] || 'online'}`,
      link: `/orders/${order._id}`
    });
    emailOrderStatus(order, 'cancelled', REASON);
  }
  return cancelled;
}

// expireUnpaidVnpayOrders: tên cũ, giữ lại để không phải sửa nơi đang gọi - xử lý MỌI cổng thanh toán online
module.exports = {
  expireUnpaidVnpayOrders,
  expireUnpaidOnlineOrders: expireUnpaidVnpayOrders,
  canStartPayment,
  PAYMENT_TIMEOUT_MINUTES,
  LINK_LIFETIME_MINUTES
};
