const { assignmentEntry, assignedBySet } = require('../utils/assignmentLog'); // nhật ký phân công
const mongoose = require('mongoose'); // kiểm tra / tạo ObjectId
const Order = require('../models/Order'); // đơn hàng
const Admin = require('../models/Admin'); // nhân viên (shipper)
const Setting = require('../models/Setting'); // cấu hình (số lần giao tối đa)
const Notification = require('../models/Notification'); // thông báo cho khách
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware'); // chi nhánh nhân viên bị giới hạn
const { transitionOrder, inScope } = require('./orderController'); // đổi trạng thái đơn theo quy tắc chung
const { searchFilter } = require('../utils/search'); // tìm kiếm không dấu
const { historyEntry } = require('../utils/orderHistory'); // dòng lịch sử đơn
const routing = require('../utils/deliveryRouting'); // tiện ích giao hàng
const { workingStore, idOf } = require('../utils/shipperScope'); // chi nhánh đang làm việc của shipper

// Giao nhận hàng (UC37 – UC40). Hai vai:
//  - Quản lý chi nhánh (quyền deliveries.manage): phân công đơn cho nhân viên giao hàng, xác nhận đã nhận tiền COD.
//  - Nhân viên giao hàng (quyền deliveries.perform): chỉ thấy và cập nhật đơn được phân công cho CHÍNH MÌNH.
// Mọi lần đổi trạng thái đi qua transitionOrder (cùng quy tắc, transaction, thông báo như trang xử lý đơn).

const ASSIGNABLE = ['confirmed', 'processing']; // chỉ phân công / đổi người khi hàng chưa rời chi nhánh
const POPULATE_STORE = ['storeId', 'name city address']; // nạp tên / địa chỉ chi nhánh
const POPULATE_SHIPPER = ['shipperId', 'name email']; // nạp tên / email shipper

const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v); // chuỗi ObjectId hợp lệ?
const storeFilter = (req) => {
  const scoped = getScopedStoreId(req); // nhân viên bị giới hạn chi nhánh
  if (scoped) return { storeId: scoped }; // -> luôn lọc theo chi nhánh đó (bỏ qua storeId gửi lên)
  return isId(req.query.storeId) ? { storeId: req.query.storeId } : {}; // admin: lọc theo chi nhánh chọn (nếu có)
};

// Tài khoản giao được đơn của chi nhánh storeId: staff đang hoạt động có quyền deliveries.perform, thuộc đúng
// chi nhánh đó hoặc không gắn chi nhánh
async function findShippers(storeId) {
  const staff = await Admin.find({ role: 'staff', isActive: true }) // mọi nhân viên đang hoạt động
    .populate('groupIds', 'permissions') // kèm quyền
    .populate('storeId', 'name');
  const eligible = staff.filter(s => s.groupIds.some(g => g.permissions?.includes('deliveries.perform'))); // có quyền giao hàng
  const resolved = await Promise.all(eligible.map(async s => { s.effectiveStore = await workingStore(s); return s; })); // chi nhánh thực tế (tính điều chuyển)
  return resolved.filter(s => s.effectiveStore && (!storeId || idOf(s.effectiveStore) === String(storeId))); // đúng chi nhánh của đơn
}

// @route GET /api/deliveries?view=assign|cod&storeId= - quản lý: đơn cần giao / tiền COD chờ đối soát
const getDeliveries = asyncHandler(async (req, res) => {
  const filter = { deliveryMethod: 'home_delivery', ...storeFilter(req) }; // chỉ đơn giao tận nơi, đúng phạm vi chi nhánh
  if (req.query.view === 'cod') Object.assign(filter, { paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null }); // tab COD: shipper đã thu tiền, chưa nộp chi nhánh
  else if (req.query.view === 'carrier') Object.assign(filter, { 'shipment.phase': { $in: ['creating', 'unknown', 'active', 'cancelled', 'failed'] } }); // tab vận đơn đơn vị vận chuyển
  else if (req.query.view === 'returns') filter.status = 'returning'; // tab đang hoàn hàng
  else if (req.query.view === 'pending') Object.assign(filter, { status: { $in: ASSIGNABLE }, shipperId: null, 'shipment.phase': { $nin: ['creating', 'unknown', 'active'] } }); // tab chờ phân công: chưa có shipper và chưa có vận đơn
  else if (req.query.view === 'ready') Object.assign(filter, { status: { $in: ASSIGNABLE }, $or: [{ shipperId: { $ne: null } }, { 'shipment.phase': { $in: ['creating', 'unknown', 'active'] } }] }); // tab đã phân công, chờ lấy hàng
  else if (req.query.view === 'shipping') filter.status = 'shipping'; // tab đang giao
  // Đang giao nhưng lần giao gần nhất thất bại -> cần liên hệ khách / giao lại
  else if (req.query.view === 'failed') Object.assign(filter, { status: 'shipping', $expr: { $eq: [{ $arrayElemAt: ['$deliveryAttempts.result', -1] }, 'failed'] } }); // lần giao cuối ($arrayElemAt -1) thất bại
  else if (req.query.view === 'history') filter.status = { $in: ['delivered', 'returned', 'cancelled'] }; // tab lịch sử: đã kết thúc
  else if (req.query.view === 'settlement') Object.assign(filter, { $or: [ // tab đối soát: COD shipper giữ + COD đơn vị vận chuyển chưa trả
    { paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null },
    { status: 'delivered', 'shipment.phase': 'active', 'shipment.codAmount': { $gt: 0 }, 'shipment.codSettledAt': null }
  ] });
  else filter.status = { $in: [...ASSIGNABLE, 'shipping'] }; // mặc định: mọi đơn đang trong quy trình giao
  Object.assign(filter, searchFilter(req.query.q)); // thêm điều kiện tìm kiếm
  if (isId(req.query.shipperId)) filter.shipperId = req.query.shipperId; // lọc theo nhân viên giao hàng (bảng điều phối)
  const page = Math.min(1000000, Math.max(1, Math.floor(Number(req.query.page) || 1))); // trang >= 1
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 25))); // 1..100, mặc định 25
  const [orders, total, cod] = await Promise.all([
    Order.find(filter).populate(...POPULATE_STORE).populate(...POPULATE_SHIPPER).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit), // đơn cũ nhất trước (ưu tiên xử lý)
    Order.countDocuments(filter), // tổng số
    req.query.view === 'cod' ? Order.aggregate([{ $match: { ...filter, ...(filter.storeId ? { storeId: new mongoose.Types.ObjectId(filter.storeId) } : {}) } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]) : Promise.resolve([]) // tab COD: tổng tiền đang giữ (aggregate cần ObjectId thật)
  ]);
  // Số đơn theo giai đoạn (cùng chi nhánh + từ khóa tìm kiếm) cho các thẻ lọc ở tab "Đơn cần giao"
  let stages;
  if (['assign', 'pending', 'ready', 'shipping', 'failed', undefined].includes(req.query.view)) {
    const base = { deliveryMethod: 'home_delivery', ...storeFilter(req), ...searchFilter(req.query.q) }; // điều kiện chung cho 4 thẻ đếm
    const ACTIVE = ['creating', 'unknown', 'active'];
    const [pending, ready, shipping, failed] = await Promise.all([
      Order.countDocuments({ ...base, status: { $in: ASSIGNABLE }, shipperId: null, 'shipment.phase': { $nin: ACTIVE } }),
      Order.countDocuments({ ...base, status: { $in: ASSIGNABLE }, $or: [{ shipperId: { $ne: null } }, { 'shipment.phase': { $in: ACTIVE } }] }),
      Order.countDocuments({ ...base, status: 'shipping' }),
      Order.countDocuments({ ...base, status: 'shipping', $expr: { $eq: [{ $arrayElemAt: ['$deliveryAttempts.result', -1] }, 'failed'] } })
    ]);
    stages = { pending, ready, shipping, failed }; // số đơn mỗi giai đoạn
  }
  res.json({ data: orders, total, page, totalPages: Math.ceil(total / limit), codTotal: cod[0]?.total || 0, stages }); // trả danh sách + tổng COD + số đếm
});

// Khu vực giao của đơn: phường/xã (addressLine2) + tỉnh/thành -> gom đơn cùng khu cho 1 shipper
const areaOf = (o) => [o.deliveryAddress?.addressLine2, o.deliveryAddress?.city].map((x) => String(x || '').trim()).filter(Boolean).join(', ') || 'Chưa rõ khu vực';
const SHIPPER_CAP = 8; // số đơn đang giữ coi là "quá tải"

// @route GET /api/deliveries/board?storeId= - BẢNG ĐIỀU PHỐI: tình trạng từng shipper + chỉ số hôm nay + khu vực đang chờ
const getBoard = asyncHandler(async (req, res) => {
  const { storeId } = storeFilter(req); // chi nhánh đang xem
  const shippers = await findShippers(storeId); // shipper của chi nhánh
  const ids = shippers.map((s) => s._id); // danh sách id shipper
  const vn = new Date(Date.now() + 7 * 3600000); // giờ Việt Nam hiện tại
  const today = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600000); // 0 giờ hôm nay theo giờ VN (đổi lại về UTC)
  const since30 = new Date(Date.now() - 30 * 86400000); // 30 ngày trước (tính điểm đánh giá)
  const now = new Date();
  const scope = { deliveryMethod: 'home_delivery', ...(storeId ? { storeId: new mongoose.Types.ObjectId(String(storeId)) } : {}) };
  const ACTIVE = ['creating', 'unknown', 'active'];
  const [active, todayStats, cod, ratings, pending] = await Promise.all([
    Order.find({ shipperId: { $in: ids }, status: { $in: [...ASSIGNABLE, 'shipping'] } }).select('shipperId status deliveryAddress express').lean(), // đơn shipper đang giữ
    Order.aggregate([
      { $match: { shipperId: { $in: ids }, 'deliveryAttempts.at': { $gte: today } } }, // đơn có lần giao hôm nay
      { $unwind: '$deliveryAttempts' }, // tách từng lần giao
      { $match: { 'deliveryAttempts.at': { $gte: today } } },
      { $group: { _id: '$shipperId', done: { $sum: { $cond: [{ $eq: ['$deliveryAttempts.result', 'success'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$deliveryAttempts.result', 'failed'] }, 1, 0] } } } } // đếm thành công / thất bại theo shipper
    ]),
    Order.aggregate([
      { $match: { shipperId: { $in: ids }, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null } }, // COD đang giữ
      { $group: { _id: '$shipperId', n: { $sum: 1 }, amount: { $sum: '$grandTotal' }, oldest: { $min: '$codCollectedAt' } } } // số đơn, số tiền, khoản giữ lâu nhất
    ]),
    Order.aggregate([
      // Order không có updatedAt -> lọc theo lúc giao xong trong lịch sử trạng thái
      { $match: { shipperId: { $in: ids }, status: 'delivered', statusHistory: { $elemMatch: { status: 'delivered', changedAt: { $gte: since30 } } } } },
      { $lookup: { from: 'reviews', localField: '_id', foreignField: 'orderId', as: 'rv', pipeline: [{ $project: { rating: 1, 'criteria.delivery': 1 } }] } }, // nối với đánh giá của đơn
      { $unwind: '$rv' },
      { $group: { _id: '$shipperId', score: { $avg: { $ifNull: ['$rv.criteria.delivery', '$rv.rating'] } }, n: { $sum: 1 } } } // điểm giao hàng trung bình (thiếu tiêu chí thì lấy điểm chung)
    ]),
    Order.find({ ...scope, status: { $in: ASSIGNABLE }, shipperId: null, 'shipment.phase': { $nin: ACTIVE }, activeTransferId: null }).select('createdAt deliveryAddress express statusHistory').lean() // đơn chờ phân công
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r._id), r])); // mảng -> Map tra theo shipperId
  const T = by(todayStats); const C = by(cod); const R = by(ratings);
  const board = shippers.map((s) => {
    const mine = active.filter((o) => String(o.shipperId) === String(s._id)); // đơn của shipper này
    const load = mine.length; // số đơn đang giữ
    const areas = {};
    for (const o of mine) { const a = areaOf(o); areas[a] = (areas[a] || 0) + 1; } // đếm theo khu vực
    const lateExpress = mine.filter((o) => o.express?.deadline && new Date(o.express.deadline) < now).length; // đơn hỏa tốc đã quá hạn giao
    return {
      _id: s._id, name: s.name, avatar: s.avatar, store: s.effectiveStore?.name, storeId: idOf(s.effectiveStore),
      load, waiting: mine.filter((o) => ASSIGNABLE.includes(o.status)).length, shipping: mine.filter((o) => o.status === 'shipping').length,
      express: mine.filter((o) => o.express?.deadline).length, lateExpress,
      status: load === 0 ? 'free' : load >= SHIPPER_CAP ? 'overloaded' : 'busy', // rảnh / bận / quá tải
      areas: Object.entries(areas).sort((a, b) => b[1] - a[1]).map(([area, n]) => ({ area, n })),
      deliveredToday: T.get(String(s._id))?.done || 0, failedToday: T.get(String(s._id))?.failed || 0,
      codHeld: C.get(String(s._id))?.n || 0, codHeldAmount: C.get(String(s._id))?.amount || 0, codOldest: C.get(String(s._id))?.oldest || null,
      rating: R.get(String(s._id))?.score ? Math.round(R.get(String(s._id)).score * 10) / 10 : null, ratingCount: R.get(String(s._id))?.n || 0
    };
  }).sort((a, b) => a.load - b.load || (b.rating || 0) - (a.rating || 0)); // ít việc nhất lên đầu, bằng nhau thì điểm cao trước
  const pendingAreas = {};
  for (const o of pending) { const a = areaOf(o); pendingAreas[a] = (pendingAreas[a] || 0) + 1; } // khu vực đang chờ
  const oldest = pending.reduce((m, o) => Math.min(m, new Date(o.createdAt).getTime()), Infinity); // đơn chờ lâu nhất
  res.json({
    data: {
      cap: SHIPPER_CAP,
      shippers: board,
      summary: {
        pending: pending.length,
        oldestPendingMinutes: Number.isFinite(oldest) ? Math.round((Date.now() - oldest) / 60000) : 0,
        expressPending: pending.filter((o) => o.express?.deadline).length,
        lateExpress: board.reduce((n, s) => n + s.lateExpress, 0),
        shipping: board.reduce((n, s) => n + s.shipping, 0),
        deliveredToday: board.reduce((n, s) => n + s.deliveredToday, 0),
        failedToday: board.reduce((n, s) => n + s.failedToday, 0),
        codHeldAmount: board.reduce((n, s) => n + s.codHeldAmount, 0),
        free: board.filter((s) => s.status === 'free').length,
        overloaded: board.filter((s) => s.status === 'overloaded').length
      },
      pendingAreas: Object.entries(pendingAreas).sort((a, b) => b[1] - a[1]).map(([area, n]) => ({ area, n }))
    }
  });
});

// @route GET /api/deliveries/shippers?storeId= - quản lý: nhân viên giao hàng chọn được
const getShippers = asyncHandler(async (req, res) => {
  const { storeId } = storeFilter(req);
  const shippers = await findShippers(storeId);
  res.json({ data: shippers.map((s) => ({ _id: s._id, name: s.name, email: s.email, store: s.effectiveStore.name, storeId: idOf(s.effectiveStore) })) }); // chỉ trả trường cần thiết
});

// @route PUT /api/deliveries/:orderId/assign { shipperId } - UC37 phân công (shipperId = null để gỡ)
const assignShipper = asyncHandler(async (req, res) => {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null; // id sai -> coi như không có
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  if (!inScope(req, order)) return res.status(403).json({ message: 'Đơn hàng thuộc chi nhánh khác' }); // chặn chi nhánh khác
  if (order.deliveryMethod !== 'home_delivery') return res.status(400).json({ message: 'Đơn nhận tại cửa hàng không cần giao' }); // nhận tại cửa hàng thì không cần shipper
  const { shipperId } = req.body; // null = gỡ phân công
  if (order.activeTransferId || routing.activeShipment(order)) return res.status(409).json({ message: 'Đơn đang điều phối hoặc có vận đơn GHN' }); // đang điều phối / đã giao đơn vị vận chuyển
  const shippers = await findShippers(order.storeId); // shipper hợp lệ của chi nhánh đơn
  // Đơn đang giao chỉ được đổi người khi người đang giữ hàng không còn giao được (tài khoản bị khóa, mất quyền
  // giao hàng, chuyển chi nhánh) - nếu không, đơn bị kẹt "Đang giao" mà không ai cập nhật được
  const holderGone = order.status === 'shipping' && !shippers.some((s) => String(s._id) === String(order.shipperId));
  if (!ASSIGNABLE.includes(order.status) && !holderGone) {
    return res.status(400).json({ message: 'Chỉ phân công được đơn đã xác nhận / đang xử lý (hàng chưa rời chi nhánh)' });
  }
  if (shipperId === null && holderGone) return res.status(400).json({ message: 'Đơn đang giao cần chọn người giao thay' }); // đơn đang giao không được để trống người giao
  if (shipperId !== null) {
    if (!isId(shipperId)) return res.status(400).json({ message: 'Vui lòng chọn nhân viên giao hàng' }); // id shipper phải hợp lệ
    if (!shippers.some((s) => String(s._id) === shipperId)) { // phải là shipper của chi nhánh
      return res.status(400).json({ message: 'Nhân viên này không giao hàng cho chi nhánh của đơn' });
    }
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, storeId: order.storeId, activeTransferId: null, status: order.status, shipperId: order.shipperId, 'deliveryPlan.verifiedAt': order.deliveryPlan?.verifiedAt || null, ...routing.shipmentGuard(order) }, // cập nhật có điều kiện: không ai vừa đổi đơn
    { $set: { shipperId: shipperId || null, assignedAt: shipperId ? new Date() : null, ...(shipperId ? assignedBySet(req) : { assignedBy: null, assignedByName: '' }), ...(shipperId ? { deliveryPlan: { storeId: order.storeId, addressKey: routing.addressKey(order), mode: 'internal', assignmentMode: 'manager_choice', verifiedBy: req.account._id, verifiedAt: new Date() } } : {}) }, // gán shipper + ghi phương án "quản lý chọn tự giao"
      $push: {
        statusHistory: historyEntry(req, order.status, shipperId ? `Phân công giao hàng: ${shippers.find(s => String(s._id) === shipperId)?.name}` : 'Gỡ phân công giao hàng', { shipperId: { from: order.shipperId, to: shipperId } }), // lịch sử đơn
        assignmentLog: assignmentEntry(req, { action: !shipperId ? 'unassign' : order.shipperId ? 'reassign' : 'assign', method: 'internal', shipper: shippers.find(s => String(s._id) === shipperId) }) // nhật ký: phân công / đổi người / gỡ
      } },
    { new: true }
  ).populate(...POPULATE_SHIPPER);
  if (!updated) return res.status(409).json({ message: 'Đơn hàng vừa thay đổi trạng thái, vui lòng tải lại' }); // thua cuộc đua cập nhật
  res.json({ data: updated });
});

// @route GET /api/deliveries/mine - UC38 nhân viên giao hàng: đơn được giao + tiền COD đang giữ
const getMyDeliveries = asyncHandler(async (req, res) => {
  const mine = { shipperId: req.account._id }; // CHỈ đơn của chính shipper
  const branch = await workingStore(req.account); // chi nhánh đang làm
  const [active, codPending, history] = await Promise.all([
    Order.find({ ...mine, storeId: branch?._id || branch || '000000000000000000000000', status: { $in: [...ASSIGNABLE, 'shipping', 'returning'] } }).populate(...POPULATE_STORE).sort({ assignedAt: 1 }), // đơn đang giao tại chi nhánh hiện tại (không chi nhánh -> id rỗng = không có đơn)
    Order.find({ ...mine, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null }).select('orderCode grandTotal codCollectedAt'), // tiền COD đang giữ
    Order.find({ ...mine, status: { $in: ['delivered', 'returned'] } }).populate(...POPULATE_STORE).populate('handover.by receipt.by', 'name').sort({ 'statusHistory.changedAt': -1 }).limit(50) // 50 đơn đã xong gần nhất
  ]);
  res.json({ data: { active, history, codPending, branch, codTotal: codPending.reduce((sum, o) => sum + o.grandTotal, 0) } }); // tổng tiền đang giữ
});

// Đơn được phân công cho CHÍNH người gọi (nhân viên giao hàng) - không thì 403 / 404
async function loadOwnDelivery(req, res) {
  const order = isId(req.params.orderId) ? await Order.findById(req.params.orderId) : null;
  if (!order) {
    res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    return null;
  }
  if (order.deliveryMethod !== 'home_delivery' || idOf(await workingStore(req.account)) !== idOf(order.storeId) || String(order.shipperId) !== String(req.account._id) || routing.activeShipment(order)) { // phải đúng shipper, đúng chi nhánh, không có vận đơn ngoài
    res.status(403).json({ message: 'Đơn hàng không được phân công cho bạn' });
    return null;
  }
  return order;
}

// @route POST /api/deliveries/:orderId/pickup - đã lấy hàng tại chi nhánh: Đang xử lý -> Đang giao
const pickUp = asyncHandler(async (req, res) => {
  const order = await loadOwnDelivery(req, res);
  if (!order) return;
  if (!routing.internalAllowed(order)) return res.status(409).json({ message: 'Cần xác minh phạm vi giao nội bộ trước khi lấy hàng' }); // ngoài phạm vi tự giao (khác tỉnh / quá 20 km)
  if (order.status !== 'processing') { // chỉ lấy hàng khi chi nhánh đã chuẩn bị xong
    return res.status(400).json({ message: order.status === 'confirmed' ? 'Chi nhánh chưa chuẩn bị xong hàng' : 'Đơn không ở bước lấy hàng' });
  }
  const result = await transitionOrder(req, order, 'shipping', { action: 'shipperPickup', note: `Nhân viên giao hàng ${req.account.name} đã lấy hàng` }); // processing -> shipping
  if (result.error) return res.status(result.error.status).json({ message: result.error.message });
  res.json({ data: result.updated });
});

// @route POST /api/deliveries/:orderId/result { result: 'success' | 'failed', reason, refused } - UC39
const reportResult = asyncHandler(async (req, res) => {
  const order = await loadOwnDelivery(req, res);
  if (!order) return;
  if (order.status !== 'shipping') return res.status(400).json({ message: 'Chỉ cập nhật kết quả cho đơn đang giao' }); // chỉ đơn đang giao
  const { result, refused } = req.body; // refused = khách từ chối nhận
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 300) : ''; // lý do: chuỗi, tối đa 300 ký tự
  const attempt = { at: new Date(), result, reason, by: req.account._id }; // 1 lần giao hàng

  if (result === 'success') { // giao thành công
    const { validateHandover } = require('./fulfillmentController');
    const checked = await validateHandover(req, order, true); // kiểm tra bằng chứng bàn giao (ảnh, người nhận...)
    if (checked.error) return res.status(400).json({ message: checked.error });
    const done = await transitionOrder(req, order, 'delivered', { // shipping -> delivered
      action: 'deliverySuccess',
      note: 'Giao hàng thành công',
      // Đơn COD: tiền đã thu, nhân viên đang giữ cho tới khi nộp chi nhánh (UC40)
      extraSet: { handover: checked.handover, ...(order.express?.windowId ? { 'express.deliveredAt': new Date() } : {}), ...(order.paymentMode === 'cod' ? { codCollectedAt: new Date(), receipt: { amount: order.grandTotal, at: new Date(), by: req.account._id, channel: 'shipper' } } : {}) },
      extraPush: { deliveryAttempts: attempt }
    });
    if (done.error) return res.status(done.error.status).json({ message: done.error.message });
    return res.json({ data: done.updated });
  }
  if (result !== 'failed') return res.status(400).json({ message: 'Kết quả giao không hợp lệ' }); // chỉ nhận success / failed
  if (!reason) return res.status(400).json({ message: 'Vui lòng nhập lý do giao không thành công' }); // thất bại phải có lý do

  // Khách từ chối nhận, hoặc đã giao thất bại đủ số lần tối đa -> trả hàng (hoàn kho, trả lượt mã)
  const settings = await Setting.findOne();
  const maxAttempts = settings?.maxDeliveryAttempts ?? 3; // mặc định giao tối đa 3 lần
  const failedSoFar = (order.deliveryAttempts || []).filter((a) => a.result === 'failed').length + 1; // tính cả lần này
  if (refused === true || failedSoFar >= maxAttempts) { // khách từ chối / hết số lần -> hoàn hàng
    const why = refused === true ? `Khách từ chối nhận hàng: ${reason}` : `Giao không thành công ${failedSoFar} lần: ${reason}`;
    const back = await transitionOrder(req, order, 'returning', { action: 'deliveryReturn', note: why, extraPush: { deliveryAttempts: attempt } }); // shipping -> returning
    if (back.error) return res.status(back.error.status).json({ message: back.error.message });
    return res.json({ data: back.updated });
  }

  // Hẹn giao lại: đơn vẫn "Đang giao", ghi lại lần giao thất bại
  const kept = await Order.findOneAndUpdate(
    { _id: order._id, status: 'shipping', shipperId: req.account._id, $expr: { $eq: [{ $size: { $ifNull: ['$deliveryAttempts', []] } }, order.deliveryAttempts.length] } }, // số lần giao chưa đổi (chống bấm 2 lần)
    { $push: { deliveryAttempts: attempt, statusHistory: historyEntry(req, order.status, `Giao chưa thành công: ${reason}`) } }, // ghi lần giao thất bại
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
    { _id: order._id, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null }, // chỉ đơn COD đã thu, chưa đối soát (đối soát 1 lần)
    { $set: { codSettledAt: new Date(), codSettledBy: req.account._id }, $push: { statusHistory: historyEntry(req, order.status, 'Đã đối soát tiền COD') } }, // ghi ai nhận tiền, lúc nào
    { new: true }
  );
  if (!updated) return res.status(400).json({ message: 'Đơn không có tiền COD chờ đối soát' });
  res.json({ data: updated });
});

module.exports = { getBoard, getDeliveries, getShippers, assignShipper, getMyDeliveries, pickUp, reportResult, settleCod, findShippers };
