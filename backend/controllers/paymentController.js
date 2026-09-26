const Order = require('../models/Order');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const vnpay = require('../utils/vnpay');

// @route POST /api/payments/vnpay/:orderId - tạo link thanh toán VNPay cho đơn của chính khách hàng
const createVnpayPayment = asyncHandler(async (req, res) => {
  if (!vnpay.isConfigured()) {
    return res.status(503).json({ message: 'Cổng thanh toán VNPay chưa được cấu hình trên máy chủ' });
  }
  const order = await Order.findById(req.params.orderId);
  if (!order || order.userId.toString() !== req.account._id.toString()) {
    return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  }
  if (order.paymentMode !== 'vnpay') return res.status(400).json({ message: 'Đơn hàng không chọn thanh toán qua VNPay' });
  if (order.paymentStatus === 'paid') return res.status(400).json({ message: 'Đơn hàng đã được thanh toán' });
  if (['cancelled', 'returned'].includes(order.status)) {
    return res.status(400).json({ message: 'Đơn hàng đã hủy, không thể thanh toán' });
  }

  const ipAddr = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const { txnRef, paymentUrl } = vnpay.buildPaymentUrl({ order, ipAddr });
  // Lưu mã giao dịch của lần thử này - chỉ kết quả VNPay trả về khớp ĐÚNG mã này mới được ghi nhận
  await Order.updateOne({ _id: order._id }, { $set: { 'paymentInfo.txnRef': txnRef, paymentStatus: 'pending' } });
  res.json({ data: { paymentUrl } });
});

// Ghi nhận kết quả thanh toán (dùng chung cho trang return và IPN). Idempotent: đơn đã "paid" giữ nguyên.
async function applyResult(result, io) {
  const order = await Order.findOne({ 'paymentInfo.txnRef': result.txnRef });
  if (!order) return { code: '01', message: 'Order not found' };
  if (Math.round(order.grandTotal) !== Math.round(result.amount)) return { code: '04', message: 'Invalid amount', order };
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return { code: '02', message: 'Order already confirmed', order };

  const info = {
    'paymentInfo.transactionNo': result.transactionNo,
    'paymentInfo.bankCode': result.bankCode,
    'paymentInfo.responseCode': result.responseCode
  };
  let paymentStatus = result.success ? 'paid' : 'failed';
  // Thanh toán thành công nhưng đơn đã bị hủy trong lúc khách đang thanh toán -> cần hoàn tiền
  if (result.success && ['cancelled', 'returned'].includes(order.status)) paymentStatus = 'refunded';

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refunded'] } },
    { $set: { ...info, paymentStatus, ...(result.success ? { 'paymentInfo.paidAt': new Date() } : {}) } },
    { new: true }
  );
  if (updated && result.success) {
    await Notification.create({
      userId: order.userId,
      type: 'order',
      title: 'Thanh toán thành công',
      message: `Đơn hàng ${order.orderCode} đã được thanh toán qua VNPay`,
      link: `/orders/${order._id}`
    });
    if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status: order.status });
  }
  return { code: '00', message: 'Confirm Success', order: updated || order };
}

// @route GET /api/payments/vnpay/return - trang kết quả phía khách gọi lên kèm query VNPay trả về
const vnpayReturn = asyncHandler(async (req, res) => {
  const result = vnpay.verifyReturn(req.query);
  if (!result) return res.status(400).json({ message: 'Chữ ký giao dịch không hợp lệ' });
  const { order } = await applyResult(result, req.app.get('io'));
  if (!order) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
  res.json({
    data: {
      success: order.paymentStatus === 'paid',
      paymentStatus: order.paymentStatus,
      responseCode: result.responseCode,
      orderId: order._id,
      orderCode: order.orderCode,
      amount: order.grandTotal
    }
  });
});

// @route GET /api/payments/vnpay/ipn - VNPay gọi trực tiếp (server-to-server), trả mã theo đặc tả VNPay
const vnpayIpn = asyncHandler(async (req, res) => {
  const result = vnpay.verifyReturn(req.query);
  if (!result) return res.json({ RspCode: '97', Message: 'Invalid signature' });
  const { code, message } = await applyResult(result, req.app.get('io'));
  res.json({ RspCode: code, Message: message });
});

module.exports = { createVnpayPayment, vnpayReturn, vnpayIpn };
