const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { emailOrderStatus } = require('./notifyEmail');
const { releaseVoucher } = require('./voucherUsage'); // trả lượt mã / suất khuyến mãi
const { withTransaction } = require('./transaction');

// Đơn thanh toán online (VNPay/MoMo) chưa thanh toán giữ hàng trong kho - quá hạn thì tự hủy để trả lại tồn kho.
// PAYMENT_TIMEOUT_MINUTES: thời gian chờ thanh toán; LINK_LIFETIME_MINUTES: hạn của 1 link VNPay (utils/vnpay.js).
// Chỉ cho tạo link mới khi còn đủ thời gian để link hết hạn TRƯỚC lúc đơn bị hủy - tránh khách trả tiền cho đơn
// vừa bị hủy.
const PAYMENT_TIMEOUT_MINUTES = Number(process.env.VNPAY_PAYMENT_TIMEOUT_MINUTES) || 30; // mặc định 30 phút
const LINK_LIFETIME_MINUTES = 15; // link VNPay sống 15 phút
const reasonFor = (mode) => `Quá hạn thanh toán ${Order.PAYMENT_LABELS[mode] || 'online'} (${PAYMENT_TIMEOUT_MINUTES} phút)`; // lý do hủy

// Đơn còn được tạo link thanh toán mới không
function canStartPayment(order, now = new Date()) {
  const ageMinutes = (now - new Date(order.createdAt)) / 60000; // tuổi đơn (phút)
  return ageMinutes <= PAYMENT_TIMEOUT_MINUTES - LINK_LIFETIME_MINUTES; // VD 30 - 15: chỉ tạo link trong 15 phút đầu
}

// Hủy các đơn VNPay quá hạn chưa thanh toán. restoreStock được truyền vào (nằm trong orderController).
// Trả về số đơn đã hủy. server.js gọi hàm này mỗi 5 phút.
async function expireUnpaidVnpayOrders({ restoreStock, now = new Date() }) {
  const deadline = new Date(now.getTime() - PAYMENT_TIMEOUT_MINUTES * 60000); // đơn tạo trước mốc này là quá hạn
  const candidates = await Order.find({
    paymentMode: { $in: Order.ONLINE_PAYMENT_MODES }, // VNPay / MoMo
    status: 'pending', // chưa xử lý
    paymentStatus: { $in: ['pending', 'failed'] }, // chưa trả tiền
    createdAt: { $lt: deadline }
  }).select('_id paymentMode'); // chỉ lấy id (đọc lại đầy đủ trong lệnh cập nhật)

  let cancelled = 0; // đếm số đơn đã hủy
  for (const { _id, paymentMode } of candidates) {
    const REASON = reasonFor(paymentMode);
    // Điều kiện nguyên tử: chỉ hủy nếu đơn VẪN chờ xác nhận và chưa thanh toán (khách có thể vừa trả tiền)
    // Hủy + hoàn kho + trả lượt mã trong 1 transaction: không có đơn đã hủy mà tồn kho chưa được trả
    const order = await withTransaction(async (session) => {
      const changed = await Order.findOneAndUpdate(
        { _id, status: 'pending', paymentStatus: { $in: ['pending', 'failed'] } },
        {
          $set: { status: 'cancelled', cancelReason: REASON },
          $push: { statusHistory: { status: 'cancelled', note: REASON, eventType: 'status', actorName: 'Hệ thống', actorRole: 'system', changedAt: new Date() } }
        },
        { new: true, session }
      );
      if (!changed) return null; // khách vừa trả tiền / đơn vừa đổi -> bỏ qua
      await restoreStock(changed.storeId, changed.items, session); // trả lại kho
      await releaseVoucher(changed, session); // trả lượt mã
      return changed;
    });
    if (!order) continue;
    cancelled++;
    await Notification.create({ // báo khách
      userId: order.userId,
      type: 'order',
      title: 'Đơn hàng đã hủy',
      message: `Đơn hàng ${order.orderCode} đã tự hủy do quá hạn thanh toán ${Order.PAYMENT_LABELS[paymentMode] || 'online'}`,
      // SỬA LỖI: trước đây link "/orders/<id>" - frontend không có trang này (bấm thông báo ra trang trống)
      link: `/account/orders/${order._id}`
    });
    emailOrderStatus(order, 'cancelled', REASON); // email (chạy nền)
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
