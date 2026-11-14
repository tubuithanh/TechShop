// =====================================================================================================
// controllers/paymentController.js - THANH TOÁN ONLINE (VNPay, MoMo)
// Luồng: (1) khách đặt đơn chọn VNPay/MoMo -> (2) frontend gọi POST /payments/<cổng>/:orderId lấy link thanh toán
//        -> (3) khách trả tiền trên trang của cổng -> (4) cổng gọi về 2 đường:
//           - IPN (máy chủ cổng gọi thẳng máy chủ mình) : nguồn tin CHÍNH THỨC, chạy kể cả khi khách đóng trình duyệt
//           - Return (trình duyệt khách quay về)        : để hiển thị kết quả ngay cho khách
//        Cả 2 đường đều kiểm tra CHỮ KÝ (HMAC) -> không ai giả được kết quả "đã thanh toán".
// =====================================================================================================
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { emailPaymentSuccess } = require('../utils/notifyEmail'); // email báo thanh toán thành công
const vnpay = require('../utils/vnpay'); // tạo link + kiểm tra chữ ký VNPay
const momo = require('../utils/momo'); // tạo link + kiểm tra chữ ký MoMo
const { canStartPayment } = require('../utils/expireUnpaidOrders'); // đơn còn trong hạn thanh toán không

const LABEL = { vnpay: 'VNPay', momo: 'MoMo' }; // tên hiển thị của cổng

// Kiểm tra chung trước khi tạo link thanh toán online cho đơn của chính khách hàng. Trả về { error } hoặc { order }.
async function loadPayableOrder(req, mode) {
  const order = await Order.findById(req.params.orderId);
  if (!order || order.userId.toString() !== req.account._id.toString()) return { status: 404, error: 'Không tìm thấy đơn hàng' }; // đơn người khác -> coi như không có
  if (order.paymentMode !== mode) return { status: 400, error: `Đơn hàng không chọn thanh toán qua ${LABEL[mode]}` };
  if (order.paymentStatus === 'paid') return { status: 400, error: 'Đơn hàng đã được thanh toán' }; // chống trả tiền 2 lần
  if (['cancelled', 'returned', 'returning'].includes(order.status)) return { status: 400, error: 'Đơn hàng đã hủy/trả, không thể thanh toán' };
  if (!canStartPayment(order)) { // quá hạn thanh toán -> sắp bị tự hủy
    return {
      status: 400,
      error: 'Đơn hàng đã quá thời hạn thanh toán online và sẽ tự hủy trong ít phút (tồn kho được trả lại). Vui lòng đặt đơn mới.'
    };
  }
  return { order };
}

// Lưu mã giao dịch của lần thử này - chỉ kết quả trả về khớp ĐÚNG mã này mới được ghi nhận.
// Chỉ đặt lại "pending" nếu CHƯA thanh toán (điều kiện nguyên tử - tránh đè kết quả "paid" vừa về)
// createDate (VNPay): lưu lại để sau này hoàn tiền (API refund cần đúng vnp_CreateDate của giao dịch gốc)
function rememberAttempt(order, txnRef, createDate) {
  return Order.updateOne(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refunded'] }, status: order.status }, // chưa trả + trạng thái chưa đổi
    {
      $set: { 'paymentInfo.txnRef': txnRef, paymentStatus: 'pending', ...(createDate ? { [`paymentInfo.createDates.${txnRef}`]: createDate } : {}) }, // lần thử hiện tại
      $push: { 'paymentInfo.txnRefs': txnRef } // lưu mọi mã đã từng tạo (khách có thể bấm thanh toán nhiều lần)
    }
  );
}

// @route POST /api/payments/vnpay/:orderId - tạo link thanh toán VNPay
const createVnpayPayment = asyncHandler(async (req, res) => {
  if (!(await vnpay.isConfigured())) { // chưa nhập khóa VNPay trong cấu hình
    return res.status(503).json({ message: 'Cổng thanh toán VNPay chưa được cấu hình trên máy chủ' });
  }
  const { order, status, error } = await loadPayableOrder(req, 'vnpay');
  if (error) return res.status(status).json({ message: error });
  const ipAddr = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; // IP khách (VNPay bắt buộc gửi)
  const { txnRef, paymentUrl, createDate } = await vnpay.buildPaymentUrl({ order, ipAddr, apiBase: apiBase(req) }); // link đã ký
  await rememberAttempt(order, txnRef, createDate);
  res.json({ data: { paymentUrl } }); // frontend chuyển trình duyệt tới link này
});

// Địa chỉ backend đang chạy (sau proxy lấy giao thức gốc) - trang thanh toán giả lập nằm ở backend
function apiBase(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim(); // http / https
  return `${proto}://${req.get('host')}`;
}

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
    created = await momo.createPayment({ order, ipnUrl: momoIpnUrl(req), apiBase: apiBase(req) }); // MoMo yêu cầu gọi API tạo giao dịch trước
  } catch (err) {
    if (err instanceof momo.MomoError) return res.status(502).json({ message: `MoMo: ${err.message}` }); // MoMo từ chối (VD số tiền ngoài giới hạn)
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
  const order = await Order.findOne({ 'paymentInfo.txnRefs': result.txnRef }); // tìm đơn theo mã giao dịch
  if (!order) return { code: 'not_found' };
  if (Math.round(order.grandTotal) !== Math.round(result.amount)) return { code: 'invalid_amount', order }; // số tiền phải khớp đúng
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return { code: 'already', order }; // đã xử lý trước đó

  const info = { // thông tin giao dịch từ cổng
    'paymentInfo.transactionNo': result.transactionNo, // mã giao dịch phía cổng
    'paymentInfo.bankCode': result.bankCode, // ngân hàng
    'paymentInfo.responseCode': result.responseCode, // mã kết quả
    ...(result.payDate ? { 'paymentInfo.payDate': result.payDate } : {})
  };
  if (!result.success && order.paymentInfo?.txnRef !== result.txnRef) return { code: 'ok', order }; // thất bại của lần thử CŨ -> bỏ qua
  let paymentStatus = result.success ? 'paid' : 'failed';
  // Thanh toán thành công nhưng đơn đã bị hủy trong lúc khách đang thanh toán -> cần hoàn tiền
  const refundPending = result.success && ['cancelled', 'returned', 'returning'].includes(order.status);

  // Cập nhật có điều kiện (chưa trả + trạng thái chưa đổi): IPN và Return về cùng lúc thì chỉ 1 bên ghi được
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refunded'] }, status: order.status },
    {
      $set: {
        ...info,
        paymentStatus,
        ...(refundPending ? { refundStatus: 'pending' } : {}), // đánh dấu chờ hoàn tiền
        ...(result.success ? { 'paymentInfo.paidAt': new Date(), 'paymentInfo.txnRef': result.txnRef } : {})
      },
      // Ghi 1 dòng lịch sử "Thanh toán thành công / thất bại"
      $push: { statusHistory: { status: order.status, eventType: 'activity', actorName: LABEL[order.paymentMode] || 'Cổng thanh toán', actorRole: 'system', note: result.success ? 'Thanh toán thành công' : 'Thanh toán thất bại', changes: { paymentStatus: { from: order.paymentStatus, to: paymentStatus } } } }
    },
    { new: true }
  );
  if (!updated) return applyResult(result, io); // đơn vừa bị thay đổi bởi request khác -> đọc lại và xử lý lại (lần sau sẽ ra 'already' hoặc ghi được)
  if (updated && result.success) { // thành công -> báo khách
    await Notification.create({
      userId: order.userId,
      type: 'order',
      title: 'Thanh toán thành công',
      message: `Đơn hàng ${order.orderCode} đã được thanh toán qua ${LABEL[order.paymentMode] || 'cổng thanh toán online'}`,
      link: `/account/orders/${order._id}`
    });
    if (io) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId: order._id, status: order.status }); // cập nhật real-time
    if (updated.paymentStatus === 'paid' && updated.refundStatus !== 'pending') emailPaymentSuccess(updated); // đơn đã hủy chờ hoàn tiền thì không gửi email "thành công"
  }
  return { code: 'ok', order: updated || order };
}

// Dữ liệu trả về trang kết quả phía khách
const resultView = (order, result) => ({
  success: order.paymentStatus === 'paid',
  paymentStatus: order.paymentStatus,
  refundStatus: order.refundStatus,
  responseCode: result.responseCode,
  message: result.message,
  orderId: order._id,
  orderCode: order.orderCode,
  amount: order.grandTotal,
  paymentMode: order.paymentMode
});

// ===== VNPay =====
// Mã trả lời IPN theo đặc tả VNPay: kết quả xử lý -> [RspCode, Message]
const VNPAY_IPN_CODES = { ok: ['00', 'Confirm Success'], not_found: ['01', 'Order not found'], invalid_amount: ['04', 'Invalid amount'], already: ['02', 'Order already confirmed'] };

// @route GET /api/payments/vnpay/return - trang kết quả phía khách gọi lên kèm query VNPay trả về
const vnpayReturn = asyncHandler(async (req, res) => {
  const result = await vnpay.verifyReturn(req.query); // kiểm chữ ký; sai -> null
  if (!result) return res.status(400).json({ message: 'Chữ ký giao dịch không hợp lệ' });
  const { order } = await applyResult(result, req.app.get('io'));
  if (!order) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
  res.json({ data: resultView(order, result) });
});

// @route GET /api/payments/vnpay/ipn - VNPay gọi trực tiếp (server-to-server), trả mã theo đặc tả VNPay
const vnpayIpn = asyncHandler(async (req, res) => {
  const result = await vnpay.verifyReturn(req.query);
  if (!result) return res.json({ RspCode: '97', Message: 'Invalid signature' }); // 97 = sai chữ ký
  const { code } = await applyResult(result, req.app.get('io'));
  const [RspCode, Message] = VNPAY_IPN_CODES[code];
  res.json({ RspCode, Message }); // VNPay thấy 00/02 thì ngừng gọi lại
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
  res.status(204).end(); // 204 = đã nhận, không có nội dung
});

// @route GET /api/payments/methods - trang thanh toán hỏi cổng nào dùng được (ẩn cổng chưa cấu hình)
const paymentMethods = asyncHandler(async (req, res) => {
  const [v, m] = await Promise.all([vnpay.isConfigured(), momo.isConfigured()]); // hỏi song song
  res.json({ vnpay: v, momo: m, momoLimits: { min: momo.MIN_AMOUNT, max: momo.MAX_AMOUNT } }); // MoMo giới hạn số tiền mỗi giao dịch
});

// @route GET /api/payments/vnpay/status - giữ lại cho giao diện cũ
const vnpayStatus = asyncHandler(async (req, res) => {
  res.json({ enabled: await vnpay.isConfigured() });
});

module.exports = { createVnpayPayment, vnpayReturn, vnpayIpn, vnpayStatus, createMomoPayment, momoReturn, momoIpn, paymentMethods, applyResult };
