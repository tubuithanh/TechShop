const mongoose = require('mongoose');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');
const { transitionOrder, inScope } = require('./orderController');
const { searchFilter } = require('../utils/search');
const { historyEntry } = require('../utils/orderHistory');
const routing = require('../utils/deliveryRouting');
const { workingStore, idOf } = require('../utils/shipperScope');

// Giao nhận hàng (UC37 – UC40). Hai vai:
//  - Quản lý chi nhánh (quyền deliveries.manage): phân công đơn cho nhân viên giao hàng, xác nhận đã nhận tiền COD.
//  - Nhân viên giao hàng (quyền deliveries.perform): chỉ thấy và cập nhật đơn được phân công cho CHÍNH MÌNH.
// Mọi lần đổi trạng thái đi qua transitionOrder (cùng quy tắc, transaction, thông báo như trang xử lý đơn).

const ASSIGNABLE = ['confirmed', 'processing']; // chỉ phân công / đổi người khi hàng chưa rời chi nhánh
const POPULATE_STORE = ['storeId', 'name city address'];
const POPULATE_SHIPPER = ['shipperId', 'name email'];

const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const storeFilter = (req) => {
  const scoped = getScopedStoreId(req);
  if (scoped) return { storeId: scoped };
  return isId(req.query.storeId) ? { storeId: req.query.storeId } : {};
};

// Tài khoản giao được đơn của chi nhánh storeId: staff đang hoạt động có quyền deliveries.perform, thuộc đúng
// chi nhánh đó hoặc không gắn chi nhánh
async function findShippers(storeId) {
  const staff = await Admin.find({ role: 'staff', isActive: true })
    .populate('groupIds', 'permissions')
    .populate('storeId', 'name');
  const eligible = staff.filter(s => s.groupIds.some(g => g.permissions?.includes('deliveries.perform')));
  const resolved = await Promise.all(eligible.map(async s => { s.effectiveStore = await workingStore(s); return s; }));
  return resolved.filter(s => s.effectiveStore && (!storeId || idOf(s.effectiveStore) === String(storeId)));
}

// @route GET /api/deliveries?view=assign|cod&storeId= - quản lý: đơn cần giao / tiền COD chờ đối soát
const getDeliveries = asyncHandler(async (req, res) => {
  const filter = { deliveryMethod: 'home_delivery', ...storeFilter(req) };
  if (req.query.view === 'cod') Object.assign(filter, { paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null });
  else if (req.query.view === 'carrier') Object.assign(filter, { 'shipment.phase': { $in: ['creating', 'unknown', 'active', 'cancelled', 'failed'] } });
  else if (req.query.view === 'returns') filter.status = 'returning';
  else if (req.query.view === 'pending') Object.assign(filter, { status: { $in: ASSIGNABLE }, shipperId: null, 'shipment.phase': { $nin: ['creating', 'unknown', 'active'] } });
  else if (req.query.view === 'ready') Object.assign(filter, { status: { $in: ASSIGNABLE }, $or: [{ shipperId: { $ne: null } }, { 'shipment.phase': { $in: ['creating', 'unknown', 'active'] } }] });
  else if (req.query.view === 'shipping') filter.status = 'shipping';
  else if (req.query.view === 'history') filter.status = { $in: ['delivered', 'returned', 'cancelled'] };
  else if (req.query.view === 'settlement') Object.assign(filter, { $or: [
    { paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null },
    { status: 'delivered', 'shipment.phase': 'active', 'shipment.codAmount': { $gt: 0 }, 'shipment.codSettledAt': null }
  ] });
  else filter.status = { $in: [...ASSIGNABLE, 'shipping'] };
  Object.assign(filter, searchFilter(req.query.q));
  const page = Math.min(1000000, Math.max(1, Math.floor(Number(req.query.page) || 1)));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 25)));
  const [orders, total, cod] = await Promise.all([
    Order.find(filter).populate(...POPULATE_STORE).populate(...POPULATE_SHIPPER).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
    req.query.view === 'cod' ? Order.aggregate([{ $match: { ...filter, ...(filter.storeId ? { storeId: new mongoose.Types.ObjectId(filter.storeId) } : {}) } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]) : Promise.resolve([])
  ]);
  res.json({ data: orders, total, page, totalPages: Math.ceil(total / limit), codTotal: cod[0]?.total || 0 });
});

// @route GET /api/deliveries/shippers?storeId= - quản lý: nhân viên giao hàng chọn được
const getShippers = asyncHandler(async (req, res) => {
  const { storeId } = storeFilter(req);
  const shippers = await findShippers(storeId);
  res.json({ data: shippers.map((s) => ({ _id: s._id, name: s.name, email: s.email, store: s.effectiveStore.name, storeId: idOf(s.effectiveStore) })) });
});

// @route PUT /api/deliveries/:orderId/assign { shipperId } - UC37 phân công (shipperId = null để gỡ)
const assignShipper = asyncHandler(async (req, res) => {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!inScope(req, order)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' });
  if (order.deliveryMethod !== 'home_delivery') return res.status(400).json({ message: 'Đơn nhận tại cửa hàng không cần giao' });
  const { shipperId } = req.body;
  if (order.activeTransferId || routing.activeShipment(order)) return res.status(409).json({ message: 'Đơn đang điều phối hoặc có vận đơn GHN' });
  const shippers = await findShippers(order.storeId);
  // Đơn đang giao chỉ được đổi người khi người đang giữ hàng không còn giao được (tài khoản bị khóa, mất quyền
  // giao hàng, chuyển chi nhánh) - nếu không, đơn bị kẹt "Đang giao" mà không ai cập nhật được
  const holderGone = order.status === 'shipping' && !shippers.some((s) => String(s._id) === String(order.shipperId));
  if (!ASSIGNABLE.includes(order.status) && !holderGone) {
    return res.status(400).json({ message: 'Chỉ phân công được đơn đã xác nhận / đang xử lý (hàng chưa rời chi nhánh)' });
  }
  if (shipperId === null && holderGone) return res.status(400).json({ message: 'Đơn đang giao cần chọn người giao thay' });
  if (shipperId !== null) {
    if (!isId(shipperId)) return res.status(400).json({ message: 'Vui lòng chọn nhân viên giao hàng' });
    if (!shippers.some((s) => String(s._id) === shipperId)) {
      return res.status(400).json({ message: 'Nhân viên này không giao hàng cho chi nhánh của đơn' });
    }
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, shipperId: order.shipperId, 'deliveryPlan.verifiedAt': order.deliveryPlan?.verifiedAt || null, ...routing.shipmentGuard(order) },
    { $set: { shipperId: shipperId || null, assignedAt: shipperId ? new Date() : null, ...(shipperId ? { deliveryPlan: { storeId: order.storeId, addressKey: routing.addressKey(order), mode: 'internal', assignmentMode: 'manager_choice', verifiedBy: req.account._id, verifiedAt: new Date() } } : {}) },
      $push: { statusHistory: historyEntry(req, order.status, shipperId ? `Phân công giao hàng: ${shippers.find(s => String(s._id) === shipperId)?.name}` : 'Gỡ phân công giao hàng', { shipperId: { from: order.shipperId, to: shipperId } }) } },
    { new: true }
  ).populate(...POPULATE_SHIPPER);
  if (!updated) return res.status(409).json({ message: 'Đơn hàng vừa thay đổi trạng thái, vui lòng tải lại' });
  res.json({ data: updated });
});

// @route GET /api/deliveries/mine - UC38 nhân viên giao hàng: đơn được giao + tiền COD đang giữ
const getMyDeliveries = asyncHandler(async (req, res) => {
  const mine = { shipperId: req.account._id };
  const branch = await workingStore(req.account);
  const [active, codPending, history] = await Promise.all([
    Order.find({ ...mine, storeId: branch?._id || branch || '000000000000000000000000', status: { $in: [...ASSIGNABLE, 'shipping', 'returning'] } }).populate(...POPULATE_STORE).sort({ assignedAt: 1 }),
    Order.find({ ...mine, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null }).select('orderCode grandTotal codCollectedAt'),
    Order.find({ ...mine, status: { $in: ['delivered', 'returned'] } }).populate(...POPULATE_STORE).populate('handover.by receipt.by', 'name').sort({ 'statusHistory.changedAt': -1 }).limit(50)
  ]);
  res.json({ data: { active, history, codPending, branch, codTotal: codPending.reduce((sum, o) => sum + o.grandTotal, 0) } });
});

// Đơn được phân công cho CHÍNH người gọi (nhân viên giao hàng) - không thì 403 / 404
async function loadOwnDelivery(req, res) {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) {
    res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    return null;
  }
  if (order.deliveryMethod !== 'home_delivery' || idOf(await workingStore(req.account)) !== idOf(order.storeId) || String(order.shipperId) !== String(req.account._id) || routing.activeShipment(order)) {
    res.status(403).json({ message: 'Đơn hàng không được phân công cho bạn' });
    return null;
  }
  return order;
}

// @route POST /api/deliveries/:orderId/pickup - đã lấy hàng tại chi nhánh: Đang xử lý -> Đang giao
const pickUp = asyncHandler(async (req, res) => {
  const order = await loadOwnDelivery(req, res);
  if (!order) return;
  if (!routing.internalAllowed(order)) return res.status(409).json({ message: 'Cần xác minh phạm vi giao nội bộ trước khi lấy hàng' });
  if (order.status !== 'processing') {
    return res.status(400).json({ message: order.status === 'confirmed' ? 'Chi nhánh chưa chuẩn bị xong hàng' : 'Đơn không ở bước lấy hàng' });
  }
  const result = await transitionOrder(req, order, 'shipping', { action: 'shipperPickup', note: `Nhân viên giao hàng ${req.account.name} đã lấy hàng` });
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});

// @route POST /api/deliveries/:orderId/result { result: 'success' | 'failed', reason, refused } - UC39
const reportResult = asyncHandler(async (req, res) => {
  const order = await loadOwnDelivery(req, res);
  if (!order) return;
  if (order.status !== 'shipping') return res.status(400).json({ message: 'Chỉ cập nhật kết quả cho đơn đang giao' });
  const { result, refused } = req.body;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  const attempt = { at: new Date(), result, reason, by: req.account._id };

  if (result === 'success') {
    const { validateHandover } = require('./fulfillmentController');
    const checked = await validateHandover(req, order, true);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const done = await transitionOrder(req, order, 'delivered', {
      action: 'deliverySuccess',
      note: 'Giao hàng thành công',
      // Đơn COD: tiền đã thu, nhân viên đang giữ cho tới khi nộp chi nhánh (UC40)
      extraSet: { handover: checked.handover, ...(order.paymentMode === 'cod' ? { codCollectedAt: new Date(), receipt: { amount: order.grandTotal, at: new Date(), by: req.account._id, channel: 'shipper' } } : {}) },
      extraPush: { deliveryAttempts: attempt }
    });
    if (done.error) return res.status(done.error.status).json({ message: done.error.message });
    return res.json({ data: done.updated });
  }
  if (result !== 'failed') return res.status(400).json({ message: 'Kết quả giao không hợp lệ' });
  if (!reason) return res.status(400).json({ message: 'Vui lòng nhập lý do giao không thành công' });

  // Khách từ chối nhận, hoặc đã giao thất bại đủ số lần tối đa -> trả hàng (hoàn kho, trả lượt mã)
  const settings = await Setting.findOne();
  const maxAttempts = settings?.maxDeliveryAttempts ?? 3;
  const failedSoFar = (order.deliveryAttempts || []).filter((a) => a.result === 'failed').length + 1;
  if (refused === true || failedSoFar >= maxAttempts) {
    const why = refused === true ? `Khách từ chối nhận hàng: ${reason}` : `Giao không thành công ${failedSoFar} lần: ${reason}`;
    const back = await transitionOrder(req, order, 'returning', { action: 'deliveryReturn', note: why, extraPush: { deliveryAttempts: attempt } });
    if (back.error) return res.status(back.error.status).json({ message: back.error.message });
    return res.json({ data: back.updated });
  }

  // Hẹn giao lại: đơn vẫn "Đang giao", ghi lại lần giao thất bại
  const kept = await Order.findOneAndUpdate(
    { _id: order._id, status: 'shipping', shipperId: req.account._id, $expr: { $eq: [{ $size: { $ifNull: ['$deliveryAttempts', []] } }, order.deliveryAttempts.length] } },
    { $push: { deliveryAttempts: attempt, statusHistory: historyEntry(req, order.status, `Giao chưa thành công: ${reason}`) } },
    { new: true }
  );
  if (!kept) return res.status(409).json({ message: 'Đơn hàng vừa thay đổi, vui lòng tải lại' });
  await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Giao hàng chưa thành công',
    message: `Đơn hàng ${order.orderCode} giao chưa thành công (${reason}), cửa hàng sẽ giao lại`,
    link: `/account/orders/${order._id}`
  });
  res.json({ data: kept });
});

// @route POST /api/deliveries/:orderId/settle-cod - UC40 quản lý xác nhận đã nhận tiền COD từ nhân viên giao hàng
const settleCod = asyncHandler(async (req, res) => {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!inScope(req, order)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' });
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null },
    { $set: { codSettledAt: new Date(), codSettledBy: req.account._id }, $push: { statusHistory: historyEntry(req, order.status, 'Đã đối soát tiền COD') } },
    { new: true }
  );
  if (!updated) return res.status(400).json({ message: 'Đơn không có tiền COD chờ đối soát' });
  res.json({ data: updated });
});

module.exports = { getDeliveries, getShippers, assignShipper, getMyDeliveries, pickUp, reportResult, settleCod, findShippers };
