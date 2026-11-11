const mongoose = require('mongoose');
const Order = require('../models/Order');
const Evidence = require('../models/DeliveryEvidence');
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');
const vnpay = require('../utils/vnpay');
const momo = require('../utils/momo');
const { transitionOrder, inScope } = require('./orderController');
const { historyEntry } = require('../utils/orderHistory');
const trim = v => typeof v === 'string' ? v.trim() : '';

async function validateHandover(req, order, needsImages = false) {
  const recipientName = trim(req.body.recipientName);
  const note = trim(req.body.note);
  const differentRecipient = req.body.differentRecipient === true || (recipientName && recipientName !== order.deliveryAddress?.fullName);
  if (!recipientName || recipientName.length > 120) return { error: 'Nhập tên người nhận thực tế (tối đa 120 ký tự)' };
  if (note.length > 1000 || (differentRecipient && !note)) return { error: 'Người nhận khác người đặt cần ghi chú (tối đa 1000 ký tự)' };
  if (order.paymentStatus !== 'paid') {
    if (!['cod', 'cash', 'bank_transfer'].includes(order.paymentMode)) return { error: 'Đơn chưa được thanh toán' };
    if (req.body.paymentConfirmed !== true) return { error: 'Cần xác nhận đã thu đủ tiền' };
    if (needsImages && order.paymentMode !== 'cod') return { error: 'Chuyển khoản phải được cửa hàng xác nhận trước khi giao' };
  }
  if (needsImages && order.paymentMode === 'cod' && req.body.paymentConfirmed !== true) return { error: 'Cần xác nhận đã thu đủ tiền COD' };
  const ids = req.body.evidenceIds || [];
  if (!Array.isArray(ids) || ids.length > 5 || (needsImages && !ids.length) || ids.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) return { error: 'Cần từ 1 đến 5 ảnh bàn giao hợp lệ' };
  if (ids.length && await Evidence.countDocuments({ _id: { $in: ids }, orderId: order._id, uploadedBy: req.account._id, expiresAt: { $gt: new Date() } }) !== ids.length) return { error: 'Ảnh không thuộc đơn này hoặc đã hết hạn' };
  return { handover: { recipientName, differentRecipient, note, evidenceIds: ids, at: new Date(), by: req.account._id } };
}
async function load(req, res) {
  const order = mongoose.isValidObjectId(req.params.id) ? await Order.findById(req.params.id) : null;
  if (!order) { res.status(404).json({ message: 'Không tìm thấy đơn hàng' }); return null; }
  if (!inScope(req, order)) { res.status(403).json({ message: 'Đơn thuộc chi nhánh khác' }); return null; }
  return order;
}
const handover = asyncHandler(async (req, res) => {
  const order = await load(req, res); if (!order) return;
  if (order.deliveryMethod !== 'store_pickup' || !['ready_for_pickup', 'shipping'].includes(order.status)) return res.status(400).json({ message: 'Đơn chưa sẵn sàng bàn giao tại cửa hàng' });
  const checked = await validateHandover(req, order);
  if (checked.error) return res.status(400).json({ message: checked.error });
  const result = await transitionOrder(req, order, 'delivered', { action: 'storeHandover', note: checked.handover.note || 'Đã bàn giao tại cửa hàng', extraSet: {
    handover: checked.handover,
    ...(order.paymentStatus !== 'paid' ? { paymentStatus: 'paid', receipt: { amount: order.grandTotal, at: new Date(), by: req.account._id, channel: 'counter' } } : {})
  } });
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});
const receiveReturn = asyncHandler(async (req, res) => {
  const order = await load(req, res); if (!order) return;
  if (req.body.received !== true) return res.status(400).json({ message: 'Cần xác nhận đã kiểm đếm và nhận lại hàng' });
  const result = await transitionOrder(req, order, 'returned', { action: 'receiveReturn', note: trim(req.body.note) || 'Chi nhánh đã nhận lại hàng', extraSet: { returnReceivedAt: new Date(), returnReceivedBy: req.account._id } });
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});
const confirmPayment = asyncHandler(async (req, res) => {
  const order = await load(req, res); if (!order) return;
  if (order.paymentMode !== 'bank_transfer' || !['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping'].includes(order.status) || req.body.confirmed !== true) return res.status(400).json({ message: 'Không thể xác nhận chuyển khoản cho đơn này' });
  const updated = await Order.findOneAndUpdate({ _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, paymentStatus: { $in: ['pending', 'failed'] } }, {
    $set: { paymentStatus: 'paid', receipt: { amount: order.grandTotal, at: new Date(), by: req.account._id, channel: 'bank_transfer' } },
    $push: { statusHistory: historyEntry(req, order.status, 'Xác nhận đã nhận chuyển khoản', { paymentStatus: { from: order.paymentStatus, to: 'paid' } }) }
  }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Đơn đã thay đổi, vui lòng tải lại' });
  res.json({ data: updated });
});
// Thông tin giao dịch gốc để hoàn qua cổng thanh toán: mã giao dịch của lần thanh toán THÀNH CÔNG
function gatewayInfo(order) {
  const info = order.paymentInfo || {};
  const txnRef = info.txnRef;
  const createDates = info.createDates instanceof Map ? Object.fromEntries(info.createDates) : (info.createDates || {});
  return { txnRef, transactionNo: info.transactionNo, transactionDate: createDates[txnRef] || info.payDate };
}
const GATEWAYS = ['vnpay', 'momo'];

// @route POST /api/orders/:id/confirm-refund
// body.method = 'gateway': gửi lệnh hoàn tiền tới VNPay / MoMo (đơn thanh toán online), thành công mới ghi nhận
// body.method = 'manual' (mặc định): nhân viên đã tự hoàn (tiền mặt, chuyển khoản, trên trang merchant) - bắt buộc ghi chú
const confirmRefund = asyncHandler(async (req, res) => {
  const order = await load(req, res); if (!order) return;
  const method = req.body.method === 'gateway' ? 'gateway' : 'manual';
  const note = trim(req.body.note).slice(0, 1000);
  if (req.body.confirmed !== true) return res.status(400).json({ message: 'Cần xác nhận hoàn tiền' });
  if (method === 'manual' && !note) return res.status(400).json({ message: 'Cần xác nhận đã hoàn tiền thực tế và nhập ghi chú giao dịch' });
  if (method === 'gateway' && !GATEWAYS.includes(order.paymentMode)) {
    return res.status(400).json({ message: 'Chỉ đơn thanh toán qua VNPay / MoMo mới hoàn tự động qua cổng thanh toán' });
  }

  // Giữ chỗ: chỉ 1 yêu cầu được chuyển "chờ hoàn" -> "đang hoàn" (2 người bấm cùng lúc không hoàn 2 lần)
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ['cancelled', 'returned'] }, refundStatus: 'pending', paymentStatus: 'paid' },
    { $set: { refundStatus: 'processing' } },
    { new: true }
  );
  if (!claimed) return res.status(409).json({ message: 'Đơn không có khoản chờ hoàn tiền (hoặc đang được người khác xử lý)' });
  const amount = Math.round(claimed.grandTotal);

  let gatewayResult = null;
  if (method === 'gateway') {
    const g = gatewayInfo(claimed);
    try {
      if (claimed.paymentMode === 'vnpay') {
        const ipAddr = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
        gatewayResult = await vnpay.refund({ ...g, amount, full: true, createBy: req.account.name, ipAddr, orderInfo: `Hoan tien don ${claimed.orderCode}` });
      } else {
        gatewayResult = await momo.refund({ transId: g.transactionNo, amount, orderCode: claimed.orderCode, description: `Hoan tien don ${claimed.orderCode}` });
      }
    } catch (err) {
      const code = String(err.code ?? err.resultCode ?? 'ERROR');
      // Trả về "chờ hoàn" để thử lại / hoàn thủ công; ghi lại lần thử thất bại
      await Order.updateOne({ _id: claimed._id, refundStatus: 'processing' }, {
        $set: { refundStatus: 'pending' },
        $push: { 'refundInfo.attempts': { at: new Date(), by: req.account._id, gateway: claimed.paymentMode, ok: false, code, message: err.message } }
      });
      if (err instanceof vnpay.VnpayRefundError || err instanceof momo.MomoError) {
        return res.status(502).json({ message: `${claimed.paymentMode === 'vnpay' ? 'VNPay' : 'MoMo'}: ${err.message}`, code });
      }
      throw err;
    }
  }

  const label = { vnpay: 'VNPay', momo: 'MoMo' }[claimed.paymentMode];
  const historyNote = method === 'gateway'
    ? `Đã hoàn ${amount.toLocaleString('vi-VN')}đ qua ${label} (mã yêu cầu ${gatewayResult.requestId})${note ? ` - ${note}` : ''}`
    : `Đã hoàn tiền: ${note}`;
  const updated = await Order.findOneAndUpdate({ _id: claimed._id, refundStatus: 'processing' }, {
    $set: {
      refundStatus: 'completed', paymentStatus: 'refunded', refundedAt: new Date(), refundedBy: req.account._id,
      'refundInfo.method': method,
      'refundInfo.gateway': method === 'gateway' ? claimed.paymentMode : undefined,
      'refundInfo.amount': amount,
      'refundInfo.requestId': gatewayResult?.requestId,
      'refundInfo.gatewayTransNo': gatewayResult?.transactionNo || gatewayResult?.transId,
      'refundInfo.note': note
    },
    $push: {
      statusHistory: historyEntry(req, claimed.status, historyNote, { paymentStatus: { from: 'paid', to: 'refunded' } }),
      ...(gatewayResult ? { 'refundInfo.attempts': { at: new Date(), by: req.account._id, gateway: claimed.paymentMode, requestId: gatewayResult.requestId, ok: true, code: gatewayResult.code, message: gatewayResult.message } } : {})
    }
  }, { new: true });

  // Báo cho khách
  if (updated?.userId) {
    await Notification.create({
      userId: updated.userId, type: 'order', title: 'Đã hoàn tiền',
      message: method === 'gateway'
        ? `Đơn ${updated.orderCode}: đã hoàn ${amount.toLocaleString('vi-VN')}đ về ${label}. Tiền về tài khoản / thẻ tùy thời gian xử lý của ngân hàng (thường 1-7 ngày làm việc).`
        : `Đơn ${updated.orderCode}: cửa hàng đã hoàn ${amount.toLocaleString('vi-VN')}đ cho bạn.`,
      link: `/account/orders/${updated._id}`
    }).catch(() => {});
  }
  res.json({ data: updated });
});

module.exports = { validateHandover, handover, receiveReturn, confirmPayment, confirmRefund };
