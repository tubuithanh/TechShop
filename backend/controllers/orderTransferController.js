const mongoose = require('mongoose');
const Order = require('../models/Order');
const Transfer = require('../models/OrderTransfer'); // yêu cầu điều phối đơn sang chi nhánh khác
const Store = require('../models/Store');
const Inventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');
const { withTransaction, transactionsSupported, BusinessError } = require('../utils/transaction');
const { getScopedStoreId, isStoreAllowed } = require('../middlewares/authMiddleware');
const { inScope } = require('./orderController');
const { historyEntry } = require('../utils/orderHistory');
const { activeShipment, shipmentGuard } = require('../utils/deliveryRouting');
const fail = (status, message) => { throw new BusinessError(status, message); }; // ném lỗi nghiệp vụ (transaction tự hủy)
// Đơn VNPay/MoMo phải thanh toán xong mới điều phối được (tránh việc tự hủy vì quá hạn thanh toán chạy chồng với điều phối)
const eligible = o => o.source !== 'pos' && !activeShipment(o) && ['pending', 'confirmed', 'processing'].includes(o.status) // đơn online, chưa có vận đơn, chưa giao, online thì đã trả tiền
  && (!Order.ONLINE_PAYMENT_MODES.includes(o.paymentMode) || o.paymentStatus === 'paid');
async function notifyOrderChanged(req, orderId) {
  const order = await Order.findById(orderId).select('userId status').lean();
  const io = req.app.get('io');
  if (io && order?.userId) io.to(`user_${order.userId}`).emit('order:statusUpdated', { orderId, status: order.status }); // báo khách đơn vừa đổi
}
const request = asyncHandler(async (req, res) => {
  if (!(await transactionsSupported())) return fail(503, 'Điều phối cần MongoDB replica set'); // cần transaction
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''; // lý do điều phối
  if (!reason || reason.length > 1000 || !mongoose.isValidObjectId(req.body.toStoreId)) return fail(400, 'Chọn chi nhánh và nhập lý do tối đa 1000 ký tự');
  const target = await Store.findOne({ _id: req.body.toStoreId, isActive: true }); // chi nhánh đích đang mở
  if (!target) return fail(400, 'Chi nhánh đích không hoạt động');
  const result = await withTransaction(async session => {
    const order = await Order.findById(req.params.id).session(session); // đọc trong transaction
    if (!order) return fail(404, 'Không tìm thấy đơn');
    if (!inScope(req, order)) return fail(403, 'Đơn thuộc chi nhánh khác');
    if (!eligible(order) || order.activeTransferId || String(order.storeId) === String(target._id)) return fail(409, 'Chỉ điều phối đơn online chưa giao, không chờ điều phối; đơn VNPay/MoMo phải thanh toán trước'); // không điều phối trùng / về chính nó
    const source = await Store.findById(order.storeId).session(session).select('name');
    if (order.deliveryMethod === 'store_pickup' && req.body.customerConsent !== true) return fail(400, 'Cần xác nhận khách đồng ý đổi nơi nhận hàng'); // nhận tại cửa hàng: khách phải đồng ý đổi nơi nhận
    const [transfer] = await Transfer.create([{ orderId: order._id, fromStoreId: order.storeId, toStoreId: target._id, fromStoreName: source?.name, toStoreName: target.name, reason, customerConsent: req.body.customerConsent === true, requestedBy: req.account._id, requestedByName: req.account.name }], { session }); // tạo yêu cầu
    const updated = await Order.updateOne({ _id: order._id, activeTransferId: null, status: order.status, storeId: order.storeId, ...shipmentGuard(order) }, { // khóa đơn: đang chờ điều phối
      $set: { activeTransferId: transfer._id }, $inc: { __v: 1 },
      $push: { statusHistory: historyEntry(req, order.status, `Yêu cầu điều phối đến ${target.name}: ${reason}`, undefined, source?.name) }
    }, { session });
    if (!updated.modifiedCount) return fail(409, 'Đơn vừa thay đổi');
    return transfer;
  });
  await notifyOrderChanged(req, result.orderId);
  res.status(201).json({ data: result });
});
const list = asyncHandler(async (req, res) => {
  const store = getScopedStoreId(req);
  const filter = { status: 'pending', ...(store ? { $or: [{ fromStoreId: store }, { toStoreId: store }] } : {}) }; // yêu cầu chờ liên quan chi nhánh mình
  const data = await Transfer.find(filter).populate('orderId', 'orderCode deliveryMethod items.name items.quantity grandTotal').populate('fromStoreId toStoreId', 'name').sort({ createdAt: 1 }).limit(100);
  res.json({ data: data.map(t => ({ ...t.toObject(), canDecide: isStoreAllowed(req, t.toStoreId), canCancel: isStoreAllowed(req, t.fromStoreId) })) }); // chi nhánh đích được chấp nhận / từ chối; chi nhánh nguồn được hủy
});
const decide = asyncHandler(async (req, res) => {
  if (!(await transactionsSupported())) return fail(503, 'Điều phối cần MongoDB replica set');
  const decision = req.body.decision;
  if (!['accepted', 'rejected', 'cancelled'].includes(decision)) return fail(400, 'Quyết định không hợp lệ'); // chấp nhận / từ chối / hủy
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (note.length > 1000) return fail(400, 'Ghi chú tối đa 1000 ký tự');
  const data = await withTransaction(async session => {
    const transfer = await Transfer.findById(req.params.transferId).session(session);
    if (!transfer) return fail(404, 'Không tìm thấy yêu cầu');
    const requiredStore = decision === 'cancelled' ? transfer.fromStoreId : transfer.toStoreId; // ai được quyết định
    if (!isStoreAllowed(req, requiredStore)) return fail(403, 'Không có quyền quyết định cho chi nhánh này');
    if (transfer.status !== 'pending') return fail(409, 'Yêu cầu đã được xử lý'); // đã xử lý rồi
    const order = await Order.findOne({ _id: transfer.orderId, activeTransferId: transfer._id, storeId: transfer.fromStoreId }).session(session); // đơn vẫn đang chờ đúng yêu cầu này
    if (!order || !eligible(order)) return fail(409, 'Đơn đã thay đổi');
    const changes = {};
    const set = { activeTransferId: null };
    if (decision === 'accepted') { // chấp nhận: chuyển kho + chuyển đơn
      if (!(await Store.exists({ _id: transfer.toStoreId, isActive: true }).session(session))) return fail(409, 'Chi nhánh đích đã ngừng hoạt động');
      for (const item of order.items) {
        if (!item.variantId) return fail(409, 'Đơn cũ thiếu phiên bản sản phẩm, không thể tự chuyển kho');
        const key = { productId: item.productId, variantId: item.variantId };
        const taken = await Inventory.updateOne({ ...key, storeId: transfer.toStoreId, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity }, $set: { lastUpdated: new Date() } }, { session }); // trừ kho chi nhánh đích (phải đủ hàng)
        if (!taken.modifiedCount) return fail(409, 'Chi nhánh đích không đủ tồn kho');
        const restored = await Inventory.updateOne({ ...key, storeId: transfer.fromStoreId }, { $inc: { stock: item.quantity }, $set: { lastUpdated: new Date() } }, { session }); // trả kho chi nhánh nguồn
        if (!restored.modifiedCount) return fail(409, 'Không tìm thấy tồn kho chi nhánh nguồn');
      }
      Object.assign(set, { storeId: transfer.toStoreId, deliveryPlan: null, status: 'pending', shipperId: null, assignedAt: null, confirmedBy: null, confirmedByName: '', confirmedAt: null, confirmedStoreName: '' }); // đơn sang chi nhánh mới, quay về "chờ xác nhận"
      changes.storeId = { from: transfer.fromStoreName || String(transfer.fromStoreId), to: transfer.toStoreName || String(transfer.toStoreId) };
      changes.status = { from: order.status, to: 'pending' };
    }
    const decisionLabel = { accepted: 'Đã tiếp nhận', rejected: 'Đã từ chối', cancelled: 'Đã hủy yêu cầu' }[decision];
    const updated = await Order.updateOne({ _id: order._id, activeTransferId: transfer._id, status: order.status }, { $set: set, $inc: { __v: 1 }, $push: { statusHistory: historyEntry(req, set.status || order.status, `Điều phối ${transfer.fromStoreName || ''} → ${transfer.toStoreName || ''}: ${decisionLabel}. ${note}`, changes, decision === 'cancelled' ? transfer.fromStoreName : transfer.toStoreName, decision === 'accepted' ? 'status' : 'activity', decision === 'accepted' ? transfer.toStoreId : transfer.fromStoreId) } }, { session }); // mở khóa đơn + ghi lịch sử
    if (!updated.modifiedCount) return fail(409, 'Đơn vừa thay đổi');
    transfer.status = decision; transfer.decidedBy = req.account._id; transfer.decidedByName = req.account.name; transfer.decidedAt = new Date(); transfer.decisionNote = note; // ghi kết quả quyết định
    await transfer.save({ session }); // lưu trong cùng transaction
    return transfer;
  });
  await notifyOrderChanged(req, data.orderId);
  res.json({ data });
});
module.exports = { request, list, decide };
