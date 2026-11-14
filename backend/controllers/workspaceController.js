// DASHBOARD: màn hình đầu tiên của trang quản trị, nội dung theo VỊ TRÍ của người đăng nhập
//   bán hàng · kho · giao hàng · kỹ thuật bảo hành · trưởng cửa hàng · admin
// Mỗi mục = "việc cần làm ngay" hoặc số liệu của chính mình, kèm đường dẫn tới đúng màn hình xử lý.
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');
const StoreInventory = require('../models/StoreInventory');
const OrderTransfer = require('../models/OrderTransfer');
const ChatConversation = require('../models/ChatConversation');
const EInvoice = require('../models/EInvoice');
const Review = require('../models/Review');
const ExpressWindow = require('../models/ExpressWindow');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const TZ = 'Asia/Ho_Chi_Minh'; // múi giờ Việt Nam
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');
const { isStoreManager } = require('../utils/staffRole');

const DAY = 86400000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const perms = (acc) => new Set((acc.groupIds || []).flatMap((g) => g.permissions || [])); // tập quyền từ mọi nhóm của tài khoản

// Vị trí: admin > trưởng cửa hàng > theo chức danh > theo quyền được cấp
function roleOf(req) {
  const a = req.account || {};
  if (req.accountRole === 'admin') return 'admin'; // admin luôn là admin
  if (isStoreManager({ role: 'staff', title: a.title })) return 'manager'; // chức danh "trưởng / quản lý chi nhánh..."
  const t = String(a.title || '').toLowerCase(); // đoán vị trí theo chức danh
  if (/giao hàng|shipper/.test(t)) return 'delivery';
  if (/bảo hành|kỹ thuật/.test(t)) return 'warranty';
  if (/kho/.test(t)) return 'warehouse';
  if (/bán hàng|thu ngân|tư vấn|cskh|chăm sóc/.test(t)) return 'sales';
  const p = perms(a); // không đoán được -> theo quyền được cấp
  if (p.has('deliveries.perform')) return 'delivery';
  if (p.has('warranties.manage')) return 'warranty';
  if (p.has('inventory.manage')) return 'warehouse';
  return 'sales'; // mặc định: bán hàng
}
const ROLE_LABEL = { admin: 'Quản trị viên', manager: 'Trưởng cửa hàng', sales: 'Bán hàng / CSKH', warehouse: 'Kho', delivery: 'Giao hàng', warranty: 'Kỹ thuật bảo hành' };

const vnToday = () => { const vn = new Date(Date.now() + 7 * 3600000); return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600000); }; // 0 giờ hôm nay theo giờ VN (dạng UTC)
const monthStart = (offset = 0) => { const vn = new Date(Date.now() + 7 * 3600000); return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + offset, 1) - 7 * 3600000); }; // ngày 1 của tháng (offset -1 = tháng trước)
const brief = (o) => ({ _id: o._id, orderCode: o.orderCode, createdAt: o.createdAt, grandTotal: o.grandTotal, name: o.deliveryAddress?.fullName, phone: o.deliveryAddress?.phone, method: o.deliveryMethod, paymentMode: o.paymentMode, status: o.status, express: o.express?.deadline ? o.express.deadline : null }); // tóm tắt đơn để hiển thị danh sách
const minutesSince = (d) => Math.round((Date.now() - new Date(d)) / 60000); // đã bao nhiêu phút

// Lần đầu đơn chuyển sang trạng thái `status` (lịch sử trạng thái)
const statusAt = (status) => ({ $first: { $map: { input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $eq: ['$$this.status', status] } } }, in: '$$this.changedAt' } } });
// Đơn GIAO XONG trong [from, to) - theo LỊCH SỬ TRẠNG THÁI (lưu ý: Order KHÔNG có updatedAt, schema đã tắt)
// Không tính thời điểm ở TƯƠNG LAI (dữ liệu sai giờ / dữ liệu mẫu) - mặc định to = bây giờ
const deliveredBetween = (storeMatch, from, to = new Date()) => [
  { $match: { ...storeMatch, status: 'delivered', statusHistory: { $elemMatch: { status: 'delivered', changedAt: { $gte: from, $lt: to } } } } }, // lọc nhanh bằng chỉ số
  { $addFields: { deliveredAt: statusAt('delivered') } }, // thời điểm giao xong
  { $match: { deliveredAt: { $gte: from, $lt: to } } } // lọc chính xác
];

// Hàng sắp hết / đã hết trong các sản phẩm bán chạy 30 ngày của chi nhánh
async function stockAlerts(storeMatch) {
  const top = await Order.aggregate([
    { $match: { ...storeMatch, createdAt: { $gte: new Date(Date.now() - 30 * DAY) }, status: { $ne: 'cancelled' } } }, // đơn 30 ngày
    { $unwind: '$items' },
    { $group: { _id: '$items.variantId', name: { $first: '$items.name' }, label: { $first: '$items.variantLabel' }, sold: { $sum: '$items.quantity' } } },
    { $sort: { sold: -1 } }, { $limit: 30 } // 30 phiên bản bán chạy nhất
  ]);
  const inv = await StoreInventory.aggregate([{ $match: { ...storeMatch, variantId: { $in: top.map((t) => t._id) } } }, { $group: { _id: '$variantId', stock: { $sum: '$stock' }, threshold: { $max: { $ifNull: ['$lowStockThreshold', 5] } } } }]);
  const by = new Map(inv.map((i) => [String(i._id), i]));
  return top.map((t) => ({ name: t.name, label: t.label, sold: t.sold, stock: by.get(String(t._id))?.stock ?? 0, threshold: by.get(String(t._id))?.threshold ?? 5 }))
    .filter((x) => x.stock <= x.threshold).sort((a, b) => a.stock - b.stock).slice(0, 8); // chỉ hàng sắp hết, ít nhất lên đầu, tối đa 8
}

// @route GET /api/workspace
const getWorkspace = asyncHandler(async (req, res) => {
  const me = req.account;
  const role = roleOf(req); // vị trí người xem
  const storeId = getScopedStoreId(req); // chi nhánh đang thao tác
  const managed = role === 'manager' ? [...new Set([String(me.storeId?._id || me.storeId || ''), ...(me.managedStoreIds || []).map((s) => String(s._id || s))].filter(Boolean))] : null; // trưởng cửa hàng: chi nhánh chính + quản lý thêm (chưa tính điều chuyển tạm thời)
  const storeMatch = role === 'admin' ? {} : role === 'manager' && managed.length ? { storeId: { $in: managed.map(oid) } } : storeId ? { storeId: oid(storeId) } : {}; // phạm vi dữ liệu
  const today = vnToday();
  const out = { role, roleLabel: ROLE_LABEL[role], name: me.name, store: me.storeId?.name || '', today: today.toISOString() };

  // Đơn online cần xác nhận (bán hàng, trưởng cửa hàng, admin)
  const toConfirm = async () => {
    const list = await Order.find({ ...storeMatch, status: 'pending', source: { $ne: 'pos' }, activeTransferId: null, $or: [{ paymentMode: { $in: ['cod', 'bank_transfer'] } }, { paymentStatus: 'paid' }] }).sort({ createdAt: 1 }).limit(6).lean(); // đơn online chờ xác nhận (online phải đã trả tiền)
    return { count: await Order.countDocuments({ ...storeMatch, status: 'pending', source: { $ne: 'pos' }, activeTransferId: null, $or: [{ paymentMode: { $in: ['cod', 'bank_transfer'] } }, { paymentStatus: 'paid' }] }), oldestMinutes: list[0] ? minutesSince(list[0].createdAt) : 0, list: list.map(brief) };
  };

  if (role === 'sales' || role === 'manager' || role === 'admin') {
    const [mine, mineMonth, mineLast, confirm, chats, transfer] = await Promise.all([
      Order.aggregate([{ $match: { source: 'pos', createdBy: me._id, createdAt: { $gte: today }, status: { $nin: ['cancelled', 'returned'] } } }, { $group: { _id: null, n: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } }]), // doanh số bán tại quầy hôm nay của tôi
      Order.aggregate([{ $match: { source: 'pos', createdBy: me._id, createdAt: { $gte: monthStart() }, status: { $nin: ['cancelled', 'returned'] } } }, { $group: { _id: null, n: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } }]), // tháng này
      Order.aggregate([{ $match: { source: 'pos', createdBy: me._id, createdAt: { $gte: monthStart(-1), $lt: monthStart() }, status: { $nin: ['cancelled', 'returned'] } } }, { $group: { _id: null, revenue: { $sum: '$grandTotal' } } }]), // tháng trước
      toConfirm(),
      ChatConversation.countDocuments({ status: 'waiting' }), // khách đang chờ chat
      Order.countDocuments({ ...storeMatch, paymentMode: 'bank_transfer', paymentStatus: { $ne: 'paid' }, status: { $in: ['pending', 'confirmed', 'processing'] } }) // chuyển khoản chưa xác nhận
    ]);
    out.sales = { todayOrders: mine[0]?.n || 0, todayRevenue: mine[0]?.revenue || 0, monthRevenue: mineMonth[0]?.revenue || 0, monthOrders: mineMonth[0]?.n || 0, lastMonthRevenue: mineLast[0]?.revenue || 0 };
    out.toConfirm = confirm;
    out.chatsWaiting = chats;
    out.transferUnpaid = transfer;
  }

  if (role === 'warehouse' || role === 'manager' || role === 'admin' || role === 'sales') {
    const [prep, pickupWait, returns, transfers, alerts] = await Promise.all([
      Order.find({ ...storeMatch, status: 'confirmed', activeTransferId: null }).sort({ 'express.deadline': -1, createdAt: 1 }).limit(8).lean(), // cần chuẩn bị (hỏa tốc lên đầu)
      Order.find({ ...storeMatch, status: 'ready_for_pickup' }).sort({ createdAt: 1 }).limit(6).lean(), // chờ khách tới lấy
      Order.countDocuments({ ...storeMatch, status: 'returning' }), // hàng trả chờ nhận
      OrderTransfer.countDocuments({ ...(storeMatch.storeId ? { toStoreId: storeMatch.storeId } : {}), status: 'pending' }), // điều phối gửi tới
      stockAlerts(storeMatch)
    ]);
    out.warehouse = {
      toPrepare: { count: await Order.countDocuments({ ...storeMatch, status: 'confirmed', activeTransferId: null }), list: prep.map(brief) },
      pickupWaiting: pickupWait.map((o) => ({ ...brief(o), waitingMinutes: minutesSince((o.statusHistory || []).find((h) => h.status === 'ready_for_pickup')?.changedAt || o.createdAt) })),
      returnsToReceive: returns, incomingTransfers: transfers, stockAlerts: alerts
    };
  }

  if (role === 'delivery') {
    const [active, done, cod, rating] = await Promise.all([
      Order.find({ shipperId: me._id, status: { $in: ['confirmed', 'processing', 'shipping'] } }).sort({ 'express.deadline': -1, assignedAt: 1 }).lean(), // đơn của shipper
      Order.aggregate([{ $match: { shipperId: me._id, 'deliveryAttempts.at': { $gte: today } } }, { $unwind: '$deliveryAttempts' }, { $match: { 'deliveryAttempts.at': { $gte: today }, 'deliveryAttempts.by': me._id } }, { $group: { _id: '$deliveryAttempts.result', n: { $sum: 1 } } }]), // giao thành công / thất bại hôm nay
      Order.aggregate([{ $match: { shipperId: me._id, paymentMode: 'cod', codCollectedAt: { $ne: null }, codSettledAt: null } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$grandTotal' } } }]), // tiền COD đang giữ
      Order.aggregate([...deliveredBetween({ shipperId: me._id }, new Date(Date.now() - 30 * DAY)), { $lookup: { from: 'reviews', localField: '_id', foreignField: 'orderId', as: 'rv' } }, { $unwind: '$rv' }, { $group: { _id: null, score: { $avg: { $ifNull: ['$rv.criteria.delivery', '$rv.rating'] } }, n: { $sum: 1 } } }]) // điểm đánh giá giao hàng 30 ngày
    ]);
    const d = Object.fromEntries(done.map((x) => [x._id, x.n]));
    out.delivery = {
      toPickup: active.filter((o) => o.status !== 'shipping').map(brief), shipping: active.filter((o) => o.status === 'shipping').map((o) => ({ ...brief(o), address: [o.deliveryAddress?.addressLine1, o.deliveryAddress?.addressLine2, o.deliveryAddress?.city].filter(Boolean).join(', ') })),
      express: active.filter((o) => o.express?.deadline).map((o) => ({ ...brief(o), minutesLeft: Math.round((new Date(o.express.deadline) - Date.now()) / 60000) })).sort((a, b) => a.minutesLeft - b.minutesLeft), // còn bao nhiêu phút tới hạn hỏa tốc
      deliveredToday: d.success || 0, failedToday: d.failed || 0, codHeld: cod[0]?.amount || 0, codCount: cod[0]?.n || 0,
      rating: rating[0]?.score ? Math.round(rating[0].score * 10) / 10 : null, ratingCount: rating[0]?.n || 0
    };
  }

  if (role === 'warranty' || role === 'manager' || role === 'admin') {
    const mineFilter = role === 'warranty' ? { assignedTo: me._id } : role === 'manager' && storeMatch.storeId ? { orderId: { $in: await Order.distinct('_id', storeMatch) } } : {}; // kỹ thuật viên: phiếu của mình; trưởng cửa hàng: phiếu của chi nhánh
    const openFilter = { ...mineFilter, status: { $nin: ['done', 'returned'] } }; // phiếu chưa xong
    const [open, statusCounts, openCount, overdueCount] = await Promise.all([
      Warranty.find(openFilter).select('ticketCode status createdAt productName customerName customerPhone issueDescription').sort({ createdAt: 1 }).limit(6).lean(),
      Warranty.aggregate([{ $match: openFilter }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Warranty.countDocuments(openFilter),
      Warranty.countDocuments({ ...openFilter, createdAt: { $lt: new Date(Date.now() - 7 * DAY) } }) // tồn quá 7 ngày
    ]);
    const byStatus = Object.fromEntries(statusCounts.map((x) => [x._id, x.n]));
    const [doneMonth, rated] = await Promise.all([
      Warranty.countDocuments({ ...mineFilter, status: { $in: ['done', 'returned'] }, updatedAt: { $gte: monthStart() } }),
      Warranty.aggregate([{ $match: { ...mineFilter, customerRating: { $gt: 0 }, updatedAt: { $gte: monthStart() } } }, { $group: { _id: null, avg: { $avg: '$customerRating' }, n: { $sum: 1 } } }])
    ]);
    out.warranty = {
      open: openCount, byStatus, overdue: overdueCount,
      oldest: open.map((w) => ({ _id: w._id, ticketCode: w.ticketCode, status: w.status, product: w.productName, customer: w.customerName, phone: w.customerPhone, issue: w.issueDescription, days: Math.floor(minutesSince(w.createdAt) / 1440) })),
      doneMonth, rating: rated[0]?.avg ? Math.round(rated[0].avg * 10) / 10 : null, ratedCount: rated[0]?.n || 0
    };
  }

  if (role === 'manager' || role === 'admin') {
    const has = await EInvoice.distinct('orderId', { status: 'issued' }); // đơn đã có hóa đơn
    const [unassigned, overdueShip, refunds, badReviews, expressOpen, einvoicePending, revenueToday, revenueYesterday] = await Promise.all([
      Order.countDocuments({ ...storeMatch, deliveryMethod: 'home_delivery', status: { $in: ['confirmed', 'processing'] }, shipperId: null, 'shipment.phase': { $nin: ['creating', 'unknown', 'active'] } }), // chưa phân công giao
      Order.aggregate([{ $match: { ...storeMatch, status: 'shipping' } }, { $addFields: { shippedAt: statusAt('shipping') } }, { $match: { shippedAt: { $lt: new Date(Date.now() - 3 * DAY) } } }, { $count: 'n' }]).then((r) => r[0]?.n || 0), // đang giao quá 3 ngày
      Order.countDocuments({ ...storeMatch, refundStatus: 'pending' }),
      Review.aggregate([{ $match: { rating: { $lte: 2 }, createdAt: { $gte: new Date(Date.now() - 7 * DAY) }, 'reply.content': { $in: [null, ''] } } }, { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'o', pipeline: [{ $project: { storeId: 1 } }] } }, ...(storeMatch.storeId ? [{ $match: { 'o.storeId': storeMatch.storeId } }] : []), { $count: 'n' }]), // đánh giá <= 2 sao 7 ngày chưa trả lời
      ExpressWindow.countDocuments({ ...(storeMatch.storeId ? { storeId: storeMatch.storeId } : {}), isActive: true, startAt: { $lte: new Date() }, endAt: { $gt: new Date() } }), // khung hỏa tốc đang mở
      Order.countDocuments({ ...storeMatch, status: 'delivered', _id: { $nin: has }, refundStatus: { $ne: 'completed' }, $or: [{ paymentMode: { $in: ['cod', 'cash'] } }, { paymentStatus: 'paid' }] }), // đơn chờ xuất hóa đơn
      Order.aggregate([...deliveredBetween(storeMatch, today), { $group: { _id: null, v: { $sum: '$grandTotal' }, n: { $sum: 1 } } }]), // doanh thu hôm nay (theo lúc giao xong)
      Order.aggregate([...deliveredBetween(storeMatch, new Date(today - DAY), today), { $group: { _id: null, v: { $sum: '$grandTotal' } } }]) // hôm qua
    ]);
    out.manager = {
      unassignedDeliveries: unassigned, stuckShipping: overdueShip, refundsPending: refunds, badReviews: badReviews[0]?.n || 0,
      expressOpen, einvoicePending, revenueToday: revenueToday[0]?.v || 0, ordersDoneToday: revenueToday[0]?.n || 0, revenueYesterday: revenueYesterday[0]?.v || 0,
      stores: role === 'admin' ? null : managed.length
    };
  }
  // ---------- Biểu đồ: đơn theo giờ (hôm nay vs hôm qua) + doanh thu 7 ngày ----------
  if (role !== 'delivery' && role !== 'warranty') {
    const yesterday = new Date(today - DAY);
    const [hours, days] = await Promise.all([
      Order.aggregate([
        { $match: { ...storeMatch, createdAt: { $gte: yesterday } } },
        { $group: { _id: { d: { $cond: [{ $gte: ['$createdAt', today] }, 'today', 'yesterday'] }, h: { $hour: { date: '$createdAt', timezone: TZ } } }, n: { $sum: 1 } } } // số đơn theo giờ: hôm nay / hôm qua
      ]),
      Order.aggregate([
        ...deliveredBetween(storeMatch, new Date(today - 6 * DAY)), // doanh thu 7 ngày
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt', timezone: TZ } }, revenue: { $sum: '$grandTotal' }, n: { $sum: 1 } } }
      ])
    ]);
    const nowHour = new Date(Date.now() + 7 * 3600000).getUTCHours(); // giờ hiện tại (VN)
    out.hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      today: h <= nowHour ? (hours.find((x) => x._id.d === 'today' && x._id.h === h)?.n || 0) : null, // giờ chưa tới -> null (biểu đồ không vẽ)
      yesterday: hours.find((x) => x._id.d === 'yesterday' && x._id.h === h)?.n || 0
    })).filter((x) => x.hour >= 7 && x.hour <= 22); // chỉ giờ mở cửa 7h - 22h
    out.week = Array.from({ length: 7 }, (_, i) => {
      const key = new Date(today - (6 - i) * DAY + 7 * 3600000).toISOString().slice(0, 10); // ngày dạng YYYY-MM-DD (giờ VN)
      const r = days.find((x) => x._id === key);
      return { day: key, revenue: r?.revenue || 0, orders: r?.n || 0 };
    });
  }

  // ---------- Hoạt động gần nhất trong phạm vi (ai làm gì, lúc nào) ----------
  if (role === 'manager' || role === 'admin' || role === 'sales' || role === 'warehouse') {
    const feed = await Order.aggregate([
      { $match: { ...storeMatch, 'statusHistory.changedAt': { $gte: new Date(Date.now() - 2 * DAY) } } }, // đơn có hoạt động 2 ngày qua
      { $addFields: { lastAt: { $max: '$statusHistory.changedAt' } } },
      { $sort: { lastAt: -1 } }, { $limit: 60 },
      { $project: { orderCode: 1, h: { $slice: ['$statusHistory', -2] } } }, // 2 dòng lịch sử cuối mỗi đơn
      { $unwind: '$h' },
      { $match: { 'h.changedAt': { $gte: new Date(Date.now() - 2 * DAY) } } },
      { $sort: { 'h.changedAt': -1 } }, { $limit: 12 }, // 12 hoạt động mới nhất
      { $project: { _id: 0, orderId: '$_id', orderCode: 1, status: '$h.status', note: '$h.note', at: '$h.changedAt', by: '$h.actorName', type: '$h.eventType' } }
    ]);
    out.feed = feed;
  }

  // ---------- Đội ngũ hôm nay (trưởng cửa hàng / admin) ----------
  if (role === 'manager' || role === 'admin') {
    const staffFilter = { role: 'staff', isActive: { $ne: false }, ...(storeMatch.storeId ? { storeId: storeMatch.storeId } : {}) };
    const staff = await Admin.find(staffFilter).select('name title avatar storeId lastLoginAt').populate('storeId', 'name').limit(60).lean(); // nhân viên trong phạm vi (tối đa 60)
    const ids = staff.map((x) => x._id);
    const [pos, confirms, deliv, warr] = await Promise.all([
      Order.aggregate([{ $match: { source: 'pos', createdBy: { $in: ids }, createdAt: { $gte: today }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$createdBy', n: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } }]), // bán tại quầy hôm nay theo người
      Order.aggregate([{ $match: { statusHistory: { $elemMatch: { changedBy: { $in: ids }, changedAt: { $gte: today } } } } }, { $unwind: '$statusHistory' }, { $match: { 'statusHistory.changedBy': { $in: ids }, 'statusHistory.changedAt': { $gte: today }, 'statusHistory.eventType': 'status' } }, { $group: { _id: '$statusHistory.changedBy', n: { $sum: 1 } } }]), // số lần đổi trạng thái đơn hôm nay
      Order.aggregate([{ $match: { 'deliveryAttempts.by': { $in: ids }, 'deliveryAttempts.at': { $gte: today } } }, { $unwind: '$deliveryAttempts' }, { $match: { 'deliveryAttempts.by': { $in: ids }, 'deliveryAttempts.at': { $gte: today } } }, { $group: { _id: '$deliveryAttempts.by', ok: { $sum: { $cond: [{ $eq: ['$deliveryAttempts.result', 'success'] }, 1, 0] } }, fail: { $sum: { $cond: [{ $eq: ['$deliveryAttempts.result', 'failed'] }, 1, 0] } } } }]), // giao hàng hôm nay theo người
      Warranty.aggregate([{ $match: { 'statusHistory.changedBy': { $in: ids }, updatedAt: { $gte: today } } }, { $unwind: '$statusHistory' }, { $match: { 'statusHistory.changedBy': { $in: ids }, 'statusHistory.changedAt': { $gte: today } } }, { $group: { _id: '$statusHistory.changedBy', n: { $sum: 1 } } }]) // cập nhật bảo hành hôm nay
    ]);
    const m = (rows) => new Map(rows.map((r) => [String(r._id), r]));
    const P = m(pos); const C = m(confirms); const D = m(deliv); const W = m(warr);
    out.team = staff.map((x) => {
      const id = String(x._id);
      const t = { posOrders: P.get(id)?.n || 0, posRevenue: P.get(id)?.revenue || 0, statusUpdates: C.get(id)?.n || 0, delivered: D.get(id)?.ok || 0, failed: D.get(id)?.fail || 0, warrantyUpdates: W.get(id)?.n || 0 };
      return { _id: x._id, name: x.name, title: x.title, avatar: x.avatar, store: x.storeId?.name || '', lastLoginAt: x.lastLoginAt, activeToday: Object.values(t).some((v) => v > 0) || (x.lastLoginAt && new Date(x.lastLoginAt) >= today), ...t }; // có làm gì hôm nay hoặc đã đăng nhập hôm nay
    }).sort((a, b) => (b.activeToday - a.activeToday) || (b.posRevenue + b.delivered * 1e6 + b.statusUpdates * 1e5) - (a.posRevenue + a.delivered * 1e6 + a.statusUpdates * 1e5)); // người hoạt động + năng suất cao lên đầu
  }

  // ---------- Admin: so sánh các chi nhánh hôm nay ----------
  if (role === 'admin') {
    const stores = await Store.find({ isActive: { $ne: false } }).select('name').lean(); // mọi chi nhánh
    const [rev, pending, unassigned] = await Promise.all([
      Order.aggregate([...deliveredBetween({}, today), { $group: { _id: '$storeId', revenue: { $sum: '$grandTotal' }, n: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { status: 'pending', source: { $ne: 'pos' }, activeTransferId: null, $or: [{ paymentMode: { $in: ['cod', 'bank_transfer'] } }, { paymentStatus: 'paid' }] } }, { $group: { _id: '$storeId', n: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { deliveryMethod: 'home_delivery', status: { $in: ['confirmed', 'processing'] }, shipperId: null, 'shipment.phase': { $nin: ['creating', 'unknown', 'active'] } } }, { $group: { _id: '$storeId', n: { $sum: 1 } } }])
    ]);
    const g = (rows, id, f = 'n') => rows.find((r) => String(r._id) === String(id))?.[f] || 0; // tra số liệu theo chi nhánh
    out.stores = stores.map((st) => ({ _id: st._id, name: st.name, revenue: g(rev, st._id, 'revenue'), done: g(rev, st._id), pending: g(pending, st._id), unassigned: g(unassigned, st._id) })).sort((a, b) => b.revenue - a.revenue);
  }

  // ---------- Shipper: lộ trình gom theo khu vực + link Google Maps nhiều điểm ----------
  if (out.delivery) {
    const all = [...out.delivery.toPickup, ...out.delivery.shipping];
    const full = await Order.find({ _id: { $in: all.map((o) => o._id) } }).select('deliveryAddress').lean();
    const addr = new Map(full.map((o) => [String(o._id), o.deliveryAddress || {}]));
    const groups = {};
    for (const o of all) {
      const a = addr.get(String(o._id)) || {};
      const area = [a.addressLine2, a.city].filter(Boolean).join(', ') || 'Chưa rõ khu vực'; // gom theo phường + tỉnh
      (groups[area] = groups[area] || []).push({ orderCode: o.orderCode, address: [a.addressLine1, a.addressLine2, a.city].filter(Boolean).join(', '), express: o.express, status: o.status });
    }
    out.delivery.route = Object.entries(groups).map(([area, stops]) => ({ area, stops })).sort((a, b) => b.stops.length - a.stops.length);
    const stops = out.delivery.shipping.map((o) => o.address).filter(Boolean).slice(0, 9); // Google Maps nhận tối đa ~10 điểm
    out.delivery.mapsUrl = stops.length ? `https://www.google.com/maps/dir/${stops.map((x) => encodeURIComponent(x)).join('/')}` : null; // link chỉ đường nhiều điểm
  }

  out.generatedAt = new Date();
  res.json({ data: out });
});

module.exports = { getWorkspace, roleOf };
