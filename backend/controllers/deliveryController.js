const mongoose = require('mongoose');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');
const { transitionOrder, inScope } = require('./orderController');

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
  const staff = await Admin.find({ role: 'staff', isActive: true, ...(storeId ? { storeId: { $in: [storeId, null] } } : {}) })
    .populate('groupIds', 'permissions')
    .populate('storeId', 'name');
  return staff.filter((s) => (s.groupIds || []).some((g) => g.permissions?.includes('deliveries.perform')));
}

// @route GET /api/deliveries?view=assign|cod&storeId= - quản lý: đơn cần giao / tiền COD chờ đối soát
const getDeliveries = asyncHandler(async (req, res) => {
  const filter = { deliveryMethod: 'home_delivery', ...storeFilter(req) };
  if (req.query.view === 'cod') Object.assign(filter, { paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null });
  else filter.status = { $in: [...ASSIGNABLE, 'shipping'] };
  const orders = await Order.find(filter).populate(...POPULATE_STORE).populate(...POPULATE_SHIPPER).sort({ createdAt: 1 }).limit(200);
  res.json({ data: orders });
});

// @route GET /api/deliveries/shippers?storeId= - quản lý: nhân viên giao hàng chọn được
const getShippers = asyncHandler(async (req, res) => {
  const { storeId } = storeFilter(req);
  const shippers = await findShippers(storeId);
  res.json({ data: shippers.map((s) => ({ _id: s._id, name: s.name, email: s.email, store: s.storeId?.name || null })) });
});

// @route PUT /api/deliveries/:orderId/assign { shipperId } - UC37 phân công (shipperId = null để gỡ)
const assignShipper = asyncHandler(async (req, res) => {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!inScope(req, order)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' });
  if (order.deliveryMethod !== 'home_delivery') return res.status(400).json({ message: 'Đơn nhận tại cửa hàng không cần giao' });
  if (!ASSIGNABLE.includes(order.status)) {
    return res.status(400).json({ message: 'Chỉ phân công được đơn đã xác nhận / đang xử lý (hàng chưa rời chi nhánh)' });
  }
  const { shipperId } = req.body;
  if (shipperId !== null) {
    if (!isId(shipperId)) return res.status(400).json({ message: 'Vui lòng chọn nhân viên giao hàng' });
    const allowed = (await findShippers(order.storeId)).some((s) => String(s._id) === shipperId);
    if (!allowed) return res.status(400).json({ message: 'Nhân viên này không giao hàng cho chi nhánh của đơn' });
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ASSIGNABLE } },
    { $set: { shipperId: shipperId || null, assignedAt: shipperId ? new Date() : null } },
    { new: true }
  ).populate(...POPULATE_SHIPPER);
  if (!updated) return res.status(409).json({ message: 'Đơn hàng vừa thay đổi trạng thái, vui lòng tải lại' });
  res.json({ data: updated });
});

// @route GET /api/deliveries/mine - UC38 nhân viên giao hàng: đơn được giao + tiền COD đang giữ
const getMyDeliveries = asyncHandler(async (req, res) => {
  const mine = { shipperId: req.account._id };
  const [active, codPending] = await Promise.all([
    Order.find({ ...mine, status: { $in: [...ASSIGNABLE, 'shipping'] } }).populate(...POPULATE_STORE).sort({ assignedAt: 1 }),
    Order.find({ ...mine, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null }).select('orderCode grandTotal codCollectedAt')
  ]);
  res.json({ data: { active, codPending, codTotal: codPending.reduce((sum, o) => sum + o.grandTotal, 0) } });
});

// Đơn được phân công cho CHÍNH người gọi (nhân viên giao hàng) - không thì 403 / 404
async function loadOwnDelivery(req, res) {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) {
    res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    return null;
  }
  if (String(order.shipperId) !== String(req.account._id)) {
    res.status(403).json({ message: 'Đơn hàng không được phân công cho bạn' });
    return null;
  }
  return order;
}

// @route POST /api/deliveries/:orderId/pickup - đã lấy hàng tại chi nhánh: Đang xử lý -> Đang giao
const pickUp = asyncHandler(async (req, res) => {
  const order = await loadOwnDelivery(req, res);
  if (!order) return;
  if (order.status !== 'processing') {
    return res.status(400).json({ message: order.status === 'confirmed' ? 'Chi nhánh chưa chuẩn bị xong hàng' : 'Đơn không ở bước lấy hàng' });
  }
  const result = await transitionOrder(req, order, 'shipping', { note: `Nhân viên giao hàng ${req.account.name} đã lấy hàng` });
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
    const done = await transitionOrder(req, order, 'delivered', {
      note: 'Giao hàng thành công',
      // Đơn COD: tiền đã thu, nhân viên đang giữ cho tới khi nộp chi nhánh (UC40)
      extraSet: order.paymentMode === 'cod' ? { codCollectedAt: new Date() } : {},
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
    const back = await transitionOrder(req, order, 'returned', { note: why, extraPush: { deliveryAttempts: attempt } });
    if (back.error) return res.status(back.error.status).json({ message: back.error.message });
    return res.json({ data: back.updated });
  }

  // Hẹn giao lại: đơn vẫn "Đang giao", ghi lại lần giao thất bại
  const kept = await Order.findOneAndUpdate(
    { _id: order._id, status: 'shipping', shipperId: req.account._id },
    { $push: { deliveryAttempts: attempt } },
    { new: true }
  );
  if (!kept) return res.status(409).json({ message: 'Đơn hàng vừa thay đổi, vui lòng tải lại' });
  await Notification.create({
    userId: order.userId,
    type: 'order',
    title: 'Giao hàng chưa thành công',
    message: `Đơn hàng ${order.orderCode} giao chưa thành công (${reason}), cửa hàng sẽ giao lại`,
    link: `/orders/${order._id}`
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
    { $set: { codSettledAt: new Date(), codSettledBy: req.account._id } },
    { new: true }
  );
  if (!updated) return res.status(400).json({ message: 'Đơn không có tiền COD chờ đối soát' });
  res.json({ data: updated });
});

module.exports = { getDeliveries, getShippers, assignShipper, getMyDeliveries, pickUp, reportResult, settleCod };
