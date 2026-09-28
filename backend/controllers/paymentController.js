const Order = require('../models/Order');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { emailPaymentSuccess } = require('../utils/notifyEmail');
const vnpay = require('../utils/vnpay');
const momo = require('../utils/momo');
const { canStartPayment } = require('../utils/expireUnpaidOrders');

const LABEL = { vnpay: 'VNPay', momo: 'MoMo' };

// Kiểm tra chung trước khi tạo link thanh toán online cho đơn của chính khách hàng. Trả về { error } hoặc { order }.
async function loadPayableOrder(req, mode) {
  const order = await Order.findById(req.params.orderId);
  if (!order || order.userId.toString() !== req.account._id.toString()) return { status: 404, error: 'Không tìm thấy đơn hàng' };
  if (order.paymentMode !== mode) return { status: 400, error: `Đơn hàng không chọn thanh toán qua ${LABEL[mode]}` };
  if (order.paymentStatus === 'paid') return { status: 400, error: 'Đơn hàng đã được thanh toán' };
  if (['cancelled', 'returned'].includes(order.status)) return { status: 400, error: 'Đơn hàng đã hủy, không thể thanh toán' };
  if (!canStartPayment(order)) {
    return {
      status: 400,
      error: 'Đơn hàng đã quá thời hạn thanh toán online và sẽ tự hủy trong ít phút (tồn kho được trả lại). Vui lòng đặt đơn mới.'
    };
  }
  return { order };
}

// Lưu mã giao dịch của lần thử này - chỉ kết quả trả về khớp ĐÚNG mã này mới được ghi nhận.
// Chỉ đặt lại "pending" nếu CHƯA thanh toán (điều kiện nguyên tử - tránh đè kết quả "paid" vừa về)
function rememberAttempt(order, txnRef) {
  return Order.updateOne(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refunded'] } },
    { $set: { 'paymentInfo.txnRef': txnRef, paymentStatus: 'pending' }, $push: { 'paymentInfo.txnRefs': txnRef } }
  );
}

// @route POST /api/payments/vnpay/:orderId - tạo link thanh toán VNPay
const createVnpayPayment = asyncHandler(async (req, res) => {
  if (!(await vnpay.isConfigured())) {
    return res.status(503).json({ message: 'Cổng thanh toán VNPay chưa được cấu hình trên máy chủ' });
  }
  const { order, status, error } = await loadPayableOrder(req, 'vnpay');
  if (error) return res.status(status).json({ message: error });
  const ipAddr = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const { txnRef, paymentUrl } = await vnpay.buildPaymentUrl({ order, ipAddr });
  await rememberAttempt(order, txnRef);
  res.json({ data: { paymentUrl } });
});

// Địa chỉ MoMo gọi báo kết quả (IPN) - theo địa chỉ máy chủ đang chạy (sau proxy lấy giao thức gốc)
function momoIpnUrl(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/payments/momo/ipn`;
}

// @route POST /api/payments/momo/:orderId - tạo link thanh toán MoMo
const createMomoPayment = asyncHandler(async (req, res) => {
  if (!(await momo.isConfigured())) {
    return res.status(503).json({ message: 'Cổng thanh toán MoMo chưa được cấu hình trên máy chủ' });
  }
  const { order, status, error } = await loadPayableOrder(req, 'momo');
  if (error) return res.status(status).json({ message: error });
  let created;
  try {
    created = await momo.createPayment({ order, ipnUrl: momoIpnUrl(req) });
  } catch (err) {
    if (err instanceof momo.MomoError) return res.status(502).json({ message: `MoMo: ${err.message}` });
    throw err;
  }
  await rememberAttempt(order, created.txnRef);
  res.json({ data: { paymentUrl: created.paymentUrl } });
});

// Ghi nhận kết quả thanh toán (dùng chung cho VNPay/MoMo, trang return và IPN). Idempotent: đơn đã "paid" giữ
// nguyên. Kết quả THẤT BẠI của 1 lần thử cũ không ghi đè lần thử mới hơn đang chờ (chỉ lần thử hiện tại mới được
// đánh dấu "failed"); kết quả THÀNH CÔNG thì luôn ghi nhận, dù đến từ lần thử nào.
// Trả về { code: 'ok' | 'not_found' | 'invalid_amount' | 'already', order }
async function applyResult(result, io) {
  const order = await Order.findOne({ 'paymentInfo.txnRefs': result.txnRef });
  if (!order) return { code: 'not_found' };
  if (Math.round(order.grandTotal) !== Math.round(result.amount)) return { code: 'invalid_amount', order };
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return { code: 'already', order };

  const info = {
    'paymentInfo.transactionNo': result.transactionNo,
    'paymentInfo.bankCode': result.bankCode,
    'paymentInfo.responseCode': result.responseCode
  };
  if (!result.success && order.paymentInfo?.txnRef !== result.txnRef) return { code: 'ok', order };
  let paymentStatus = result.success ? 'paid' : 'failed';
  // Thanh toán thành công nhưng đơn đã bị hủy trong lúc khách đang thanh toán -> cần hoàn tiền
  if (result.success && ['cancelled', 'returned'].includes(order.status)) paymentStatus = 'refunded';

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refunded'] } },
    {
      $set: {
        ...info,
        paymentStatus,
        ...(result.success ? { 'paymentInfo.paidAt': new Date(), 'paymentInfo.txnRef': result.txnRef } : {})
      }
    },
    { new: true }
  );
  if (updated && result.success) {
    await Notification.create({
      userId: order.userId,
      type: 'order',
      title: 'Thanh toán thành công',
      message: `Đơn hàng ${order.orderCode} đã được thanh toán qua ${LABEL[order.paymentMode] || 'cổng thanh toán online'}`,
      link: `/orders/${order._id}`
    });
    if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status: order.status });
    if (updated.paymentStatus === 'paid') emailPaymentSuccess(updated);
  }
  return { code: 'ok', order: updated || order };
}

// Dữ liệu trả về trang kết quả phía khách
const resultView = (order, result) => ({
  success: order.paymentStatus === 'paid',
  paymentStatus: order.paymentStatus,
  responseCode: result.responseCode,
  message: result.message,
  orderId: order._id,
  orderCode: order.orderCode,
  amount: order.grandTotal,
  paymentMode: order.paymentMode
});

// ===== VNPay =====
const VNPAY_IPN_CODES = { ok: ['00', 'Confirm Success'], not_found: ['01', 'Order not found'], invalid_amount: ['04', 'Invalid amount'], already: ['02', 'Order already confirmed'] };

// @route GET /api/payments/vnpay/return - trang kết quả phía khách gọi lên kèm query VNPay trả về
const vnpayReturn = asyncHandler(async (req, res) => {
  const result = await vnpay.verifyReturn(req.query);
  if (!result) return res.status(400).json({ message: 'Chữ ký giao dịch không hợp lệ' });
  const { order } = await applyResult(result, req.app.get('io'));
  if (!order) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
  res.json({ data: resultView(order, result) });
});

// @route GET /api/payments/vnpay/ipn - VNPay gọi trực tiếp (server-to-server), trả mã theo đặc tả VNPay
const vnpayIpn = asyncHandler(async (req, res) => {
  const result = await vnpay.verifyReturn(req.query);
  if (!result) return res.json({ RspCode: '97', Message: 'Invalid signature' });
  const { code } = await applyResult(result, req.app.get('io'));
  const [RspCode, Message] = VNPAY_IPN_CODES[code];
  res.json({ RspCode, Message });
});

// ===== MoMo =====

// @route GET /api/payments/momo/return - trang kết quả phía khách gọi lên kèm query MoMo gắn vào redirectUrl
const momoReturn = asyncHandler(async (req, res) => {
  const result = await momo.verifyResult(req.query);
  if (!result) return res.status(400).json({ message: 'Chữ ký giao dịch không hợp lệ' });
  const { order } = await applyResult(result, req.app.get('io'));
  if (!order) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
  res.json({ data: resultView(order, result) });
});

// @route POST /api/payments/momo/ipn - MoMo gọi trực tiếp (server-to-server, body JSON). Theo đặc tả MoMo v2
// trả HTTP 204 khi đã nhận; sai chữ ký trả 400 để MoMo biết.
const momoIpn = asyncHandler(async (req, res) => {
  const result = await momo.verifyResult(req.body);
  if (!result) return res.status(400).json({ message: 'Invalid signature' });
  const { code } = await applyResult(result, req.app.get('io'));
  if (code === 'not_found' || code === 'invalid_amount') return res.status(400).json({ message: code });
  res.status(204).end();
});

// @route GET /api/payments/methods - trang thanh toán hỏi cổng nào dùng được (ẩn cổng chưa cấu hình)
const paymentMethods = asyncHandler(async (req, res) => {
  const [v, m] = await Promise.all([vnpay.isConfigured(), momo.isConfigured()]);
  res.json({ vnpay: v, momo: m, momoLimits: { min: momo.MIN_AMOUNT, max: momo.MAX_AMOUNT } });
});

// @route GET /api/payments/vnpay/status - giữ lại cho giao diện cũ
const vnpayStatus = asyncHandler(async (req, res) => {
  res.json({ enabled: await vnpay.isConfigured() });
});

module.exports = { createVnpayPayment, vnpayReturn, vnpayIpn, vnpayStatus, createMomoPayment, momoReturn, momoIpn, paymentMethods, applyResult };
