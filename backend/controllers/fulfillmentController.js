const mongoose = require('mongoose');
const Order = require('../models/Order');
const Evidence = require('../models/DeliveryEvidence');
const asyncHandler = require('../utils/asyncHandler');
const { transitionOrder, inScope } = require('./orderController');
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
  const updated = await Order.findOneAndUpdate({ _id: order._id, status: order.status, paymentStatus: { $in: ['pending', 'failed'] } }, { $set: { paymentStatus: 'paid', receipt: { amount: order.grandTotal, at: new Date(), by: req.account._id, channel: 'bank_transfer' } } }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Đơn đã thay đổi, vui lòng tải lại' });
  res.json({ data: updated });
});
const confirmRefund = asyncHandler(async (req, res) => {
  const order = await load(req, res); if (!order) return;
  if (req.body.confirmed !== true || !trim(req.body.note)) return res.status(400).json({ message: 'Cần xác nhận đã hoàn tiền thực tế và nhập ghi chú giao dịch' });
  const updated = await Order.findOneAndUpdate({ _id: order._id, status: { $in: ['cancelled', 'returned'] }, refundStatus: 'pending', paymentStatus: 'paid' }, {
    $set: { refundStatus: 'completed', paymentStatus: 'refunded', refundedAt: new Date(), refundedBy: req.account._id },
    $push: { statusHistory: { status: order.status, note: `Đã hoàn tiền: ${trim(req.body.note).slice(0, 1000)}`, changedBy: req.account._id } }
  }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Đơn không có khoản chờ hoàn tiền' });
  res.json({ data: updated });
});
module.exports = { validateHandover, handover, receiveReturn, confirmPayment, confirmRefund };
