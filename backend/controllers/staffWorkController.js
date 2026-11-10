// Điều chuyển nhân viên giữa chi nhánh, quản lý nhiều chi nhánh, quá trình làm việc, hiệu suất & đánh giá cuối năm.
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');
const WarrantyCard = require('../models/WarrantyCard');
const StaffAssignment = require('../models/StaffAssignment');
const StaffReview = require('../models/StaffReview');
const asyncHandler = require('../utils/asyncHandler');
const { disconnectAccount } = require('../utils/socketAuth');

const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86400000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const validId = (v) => mongoose.isValidObjectId(String(v ?? ''));
const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const yearRange = (year) => ({ from: new Date(`${year}-01-01T00:00:00+07:00`), to: new Date(`${year + 1}-01-01T00:00:00+07:00`) });

async function loadStaff(req, res) {
  if (!validId(req.params.id)) { res.status(404).json({ message: 'Không tìm thấy nhân viên' }); return null; }
  const staff = await Admin.findById(req.params.id);
  if (!staff) { res.status(404).json({ message: 'Không tìm thấy nhân viên' }); return null; }
  return staff;
}

// Ghi lịch sử khi admin đổi chi nhánh chính / danh sách chi nhánh quản lý (gọi từ staffController.updateStaff)
async function recordStoreChanges(staff, before, actorId) {
  const now = new Date();
  // Nhân viên có từ trước khi có tính năng: tạo bù lịch sử theo trạng thái TRƯỚC khi sửa
  await ensureBaseHistory({ _id: staff._id, storeId: before.storeId, managedStoreIds: before.managedStoreIds, title: staff.title, createdAt: staff.createdAt });
  const prevHome = before.storeId ? String(before.storeId) : null;
  const nextHome = staff.storeId ? String(staff.storeId._id || staff.storeId) : null;
  if (prevHome !== nextHome) {
    await StaffAssignment.updateMany({ staffId: staff._id, kind: 'home', endDate: null }, { $set: { endDate: now, endedBy: actorId, endNote: 'Đổi chi nhánh chính' } });
    if (nextHome) {
      await StaffAssignment.create({ staffId: staff._id, storeId: nextHome, kind: 'home', title: staff.title, startDate: now, createdBy: actorId });
    }
  }
  const prevManaged = new Set((before.managedStoreIds || []).map(String));
  const nextManaged = new Set((staff.managedStoreIds || []).map((s) => String(s._id || s)));
  const removed = [...prevManaged].filter((s) => !nextManaged.has(s));
  const added = [...nextManaged].filter((s) => !prevManaged.has(s));
  if (removed.length) {
    await StaffAssignment.updateMany(
      { staffId: staff._id, kind: 'manage', storeId: { $in: removed.map(oid) }, endDate: null },
      { $set: { endDate: now, endedBy: actorId, endNote: 'Thôi phụ trách chi nhánh' } }
    );
  }
  for (const storeId of added) {
    await StaffAssignment.create({ staffId: staff._id, storeId, kind: 'manage', title: 'Quản lý', startDate: now, createdBy: actorId });
  }
}

// Nhân viên có từ trước khi có tính năng: chưa có lịch sử -> tạo giai đoạn chi nhánh chính từ ngày tạo tài khoản
async function ensureBaseHistory(staff) {
  if (await StaffAssignment.exists({ staffId: staff._id })) return;
  const docs = [];
  if (staff.storeId) docs.push({ staffId: staff._id, storeId: staff.storeId._id || staff.storeId, kind: 'home', title: staff.title, startDate: staff.createdAt || new Date() });
  for (const m of staff.managedStoreIds || []) docs.push({ staffId: staff._id, storeId: m._id || m, kind: 'manage', title: 'Quản lý', startDate: staff.createdAt || new Date() });
  if (docs.length) await StaffAssignment.insertMany(docs);
}

const view = (a, now = new Date()) => ({ ...a.toObject(), state: a.stateAt(now) });

// @route GET /api/staff/me/stores - nhân viên xem các chi nhánh mình được thao tác (cho ô chọn chi nhánh)
const myStores = asyncHandler(async (req, res) => {
  const scope = req.storeScope || { allowed: [], current: null, stores: [], transfer: null };
  res.json({ data: { current: scope.current, stores: scope.stores, transfer: scope.transfer } });
});

// @route GET /api/staff/:id/assignments - quá trình làm việc
const listAssignments = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res);
  if (!staff) return;
  await ensureBaseHistory(staff);
  const list = await StaffAssignment.find({ staffId: staff._id })
    .populate('storeId', 'name city')
    .populate('createdBy endedBy', 'name')
    .sort({ startDate: -1 });
  res.json({ data: list.map((a) => view(a)) });
});

// @route POST /api/staff/:id/transfers { storeId, startDate, endDate | months, reason, title }
const createTransfer = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res);
  if (!staff) return;
  if (staff.role !== 'staff') return res.status(400).json({ message: 'Chỉ điều chuyển được tài khoản nhân viên' });
  const { storeId, reason, title } = req.body;
  if (!validId(storeId) || !(await Store.exists({ _id: storeId, isActive: { $ne: false } }))) return res.status(400).json({ message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động' });
  if (String(storeId) === String(staff.storeId || '')) return res.status(400).json({ message: 'Nhân viên đang thuộc chi nhánh này' });
  const start = parseDate(req.body.startDate) || new Date();
  let end = parseDate(req.body.endDate);
  const months = Number(req.body.months);
  if (!end && Number.isInteger(months) && months > 0 && months <= 36) {
    end = new Date(start);
    end.setMonth(end.getMonth() + months);
  }
  if (!end) return res.status(400).json({ message: 'Điều chuyển tạm thời cần ngày kết thúc (hoặc số tháng)' });
  if (end <= start) return res.status(400).json({ message: 'Ngày kết thúc phải sau ngày bắt đầu' });
  if (end - start > 3 * 366 * DAY) return res.status(400).json({ message: 'Điều chuyển tạm thời tối đa 3 năm - quá thời gian này hãy đổi chi nhánh chính' });
  // Không cho 2 lần điều chuyển chồng thời gian lên nhau (không biết nhân viên đang ở đâu)
  const overlap = await StaffAssignment.findOne({
    staffId: staff._id, kind: 'transfer', cancelled: { $ne: true },
    startDate: { $lt: end }, $or: [{ endDate: null }, { endDate: { $gt: start } }]
  }).populate('storeId', 'name');
  if (overlap) return res.status(409).json({ message: `Trùng thời gian với đợt điều chuyển tới ${overlap.storeId?.name || 'chi nhánh khác'}` });

  await ensureBaseHistory(staff);
  const a = await StaffAssignment.create({
    staffId: staff._id, storeId, kind: 'transfer', title: String(title || staff.title || '').trim().slice(0, 80),
    startDate: start, endDate: end, reason: String(reason || '').trim().slice(0, 300), createdBy: req.account._id
  });
  disconnectAccount(req, staff._id); // phạm vi chi nhánh đổi -> làm mới kết nối real-time
  res.status(201).json({ data: view(await a.populate('storeId', 'name city')) });
});

// @route POST /api/staff/:id/transfers/:aid/end { note } - kết thúc sớm (đang diễn ra) hoặc hủy (chưa bắt đầu)
const endTransfer = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res);
  if (!staff) return;
  const a = validId(req.params.aid) ? await StaffAssignment.findOne({ _id: req.params.aid, staffId: staff._id, kind: 'transfer' }) : null;
  if (!a) return res.status(404).json({ message: 'Không tìm thấy đợt điều chuyển' });
  const state = a.stateAt();
  const note = String(req.body.note || '').trim().slice(0, 300);
  if (state === 'upcoming') a.cancelled = true;
  else if (state === 'active') a.endDate = new Date();
  else return res.status(400).json({ message: 'Đợt điều chuyển đã kết thúc' });
  a.endedBy = req.account._id;
  a.endNote = note || (state === 'upcoming' ? 'Hủy điều chuyển' : 'Kết thúc điều chuyển sớm');
  await a.save();
  disconnectAccount(req, staff._id);
  res.json({ data: view(await a.populate('storeId', 'name city')) });
});

// ---------- Hiệu suất ----------

// Số ngày làm việc ở từng chi nhánh trong năm (theo quá trình làm việc; điều chuyển được trừ khỏi chi nhánh chính)
function daysByStore(assignments, from, to) {
  const now = new Date();
  const cap = to < now ? to : now;
  const clip = (a) => {
    const s = Math.max(a.startDate, from);
    const e = Math.min(a.endDate || cap, cap);
    return e > s ? [s, e] : null;
  };
  const result = new Map();
  const add = (store, ms) => {
    if (ms <= 0) return;
    const key = String(store._id || store);
    const cur = result.get(key) || { storeId: key, name: store.name || '', days: 0 };
    cur.days += ms / DAY;
    result.set(key, cur);
  };
  const transfers = assignments.filter((a) => a.kind === 'transfer' && !a.cancelled).map((a) => ({ a, r: clip(a) })).filter((x) => x.r);
  for (const t of transfers) add(t.a.storeId, t.r[1] - t.r[0]);
  for (const h of assignments.filter((a) => a.kind === 'home')) {
    const r = clip(h);
    if (!r) continue;
    let ms = r[1] - r[0];
    for (const t of transfers) ms -= Math.max(0, Math.min(r[1], t.r[1]) - Math.max(r[0], t.r[0]));
    add(h.storeId, ms);
  }
  return [...result.values()].map((x) => ({ ...x, days: Math.round(x.days) })).sort((a, b) => b.days - a.days);
}

// Số liệu 1 năm của 1 hoặc nhiều nhân viên. Trả về Map(staffId -> metrics)
async function metricsFor(staffIds, year) {
  const { from, to } = yearRange(year);
  const ids = staffIds.map(oid);
  const monthOf = (field) => ({ $month: { date: field, timezone: TZ } });
  const [pos, handled, deliveries, repairs, extensions] = await Promise.all([
    // Bán tại quầy: đơn do nhân viên tạo, đã giao (không tính đơn hủy / trả)
    Order.aggregate([
      { $match: { source: 'pos', createdBy: { $in: ids }, status: 'delivered', createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: { s: '$createdBy', m: monthOf('$createdAt'), store: '$storeId' }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } }
    ]),
    // Đơn đã xử lý: số đơn nhân viên có cập nhật trạng thái (xác nhận, đóng gói, bàn giao...)
    Order.aggregate([
      { $match: { 'statusHistory.changedBy': { $in: ids }, createdAt: { $gte: from, $lt: to } } },
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.changedBy': { $in: ids } } },
      { $group: { _id: { s: '$statusHistory.changedBy', o: '$_id' }, at: { $first: '$statusHistory.changedAt' }, store: { $first: '$storeId' } } },
      { $group: { _id: { s: '$_id.s', m: monthOf('$at'), store: '$store' }, orders: { $sum: 1 } } }
    ]),
    // Giao hàng: đơn được phân công, giao thành công, số lần giao thất bại
    Order.aggregate([
      { $match: { shipperId: { $in: ids }, createdAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { s: '$shipperId', m: monthOf('$createdAt') },
          assigned: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $size: { $filter: { input: { $ifNull: ['$deliveryAttempts', []] }, cond: { $eq: ['$$this.result', 'failed'] } } } } }
        }
      }
    ]),
    // Phiếu bảo hành / sửa chữa đã xử lý (có cập nhật trạng thái) + đánh giá trung bình của khách
    Warranty.aggregate([
      { $match: { 'statusHistory.changedBy': { $in: ids }, createdAt: { $gte: from, $lt: to } } },
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.changedBy': { $in: ids } } },
      { $group: { _id: { s: '$statusHistory.changedBy', w: '$_id' }, at: { $first: '$statusHistory.changedAt' }, rating: { $first: '$customerRating' } } },
      { $group: { _id: { s: '$_id.s', m: monthOf('$at') }, tickets: { $sum: 1 }, ratingSum: { $sum: { $ifNull: ['$rating', 0] } }, rated: { $sum: { $cond: [{ $gt: ['$rating', 0] }, 1, 0] } } } }
    ]),
    // Gói bảo hành mở rộng đã bán / xác nhận thu tiền
    WarrantyCard.aggregate([
      { $match: { 'extensions.paidBy': { $in: ids } } },
      { $unwind: '$extensions' },
      { $match: { 'extensions.paidBy': { $in: ids }, 'extensions.status': 'paid', 'extensions.paidAt': { $gte: from, $lt: to } } },
      { $group: { _id: { s: '$extensions.paidBy', m: monthOf('$extensions.paidAt') }, count: { $sum: 1 }, revenue: { $sum: '$extensions.price' } } }
    ])
  ]);

  const out = new Map();
  const blank = () => ({
    totals: { posRevenue: 0, posOrders: 0, ordersHandled: 0, deliveriesAssigned: 0, deliveriesDone: 0, deliveryFailures: 0, repairTickets: 0, repairRating: null, extensionsSold: 0, extensionRevenue: 0 },
    monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, posRevenue: 0, posOrders: 0, ordersHandled: 0, deliveriesDone: 0, repairTickets: 0, extensionRevenue: 0 })),
    byStore: new Map(),
    _rating: [0, 0]
  });
  const get = (id) => {
    const k = String(id);
    if (!out.has(k)) out.set(k, blank());
    return out.get(k);
  };
  const storeRow = (m, store) => {
    const k = String(store);
    if (!m.byStore.has(k)) m.byStore.set(k, { storeId: k, posRevenue: 0, posOrders: 0, ordersHandled: 0 });
    return m.byStore.get(k);
  };
  for (const r of pos) {
    const m = get(r._id.s);
    m.totals.posRevenue += r.revenue; m.totals.posOrders += r.orders;
    m.monthly[r._id.m - 1].posRevenue += r.revenue; m.monthly[r._id.m - 1].posOrders += r.orders;
    const s = storeRow(m, r._id.store); s.posRevenue += r.revenue; s.posOrders += r.orders;
  }
  for (const r of handled) {
    const m = get(r._id.s);
    m.totals.ordersHandled += r.orders;
    m.monthly[r._id.m - 1].ordersHandled += r.orders;
    storeRow(m, r._id.store).ordersHandled += r.orders;
  }
  for (const r of deliveries) {
    const m = get(r._id.s);
    m.totals.deliveriesAssigned += r.assigned; m.totals.deliveriesDone += r.delivered; m.totals.deliveryFailures += r.failed;
    m.monthly[r._id.m - 1].deliveriesDone += r.delivered;
  }
  for (const r of repairs) {
    const m = get(r._id.s);
    m.totals.repairTickets += r.tickets;
    m.monthly[r._id.m - 1].repairTickets += r.tickets;
    m._rating[0] += r.ratingSum; m._rating[1] += r.rated;
  }
  for (const r of extensions) {
    const m = get(r._id.s);
    m.totals.extensionsSold += r.count; m.totals.extensionRevenue += r.revenue;
    m.monthly[r._id.m - 1].extensionRevenue += r.revenue;
  }
  for (const m of out.values()) {
    m.totals.repairRating = m._rating[1] ? Math.round((m._rating[0] / m._rating[1]) * 10) / 10 : null;
    delete m._rating;
  }
  return { get, out };
}

const parseYear = (v) => {
  const y = Number.parseInt(v, 10);
  const now = new Date().getFullYear();
  return Number.isInteger(y) && y >= 2000 && y <= now + 1 ? y : now;
};

// @route GET /api/staff/:id/performance?year= - hiệu suất 1 năm + quá trình làm việc + đánh giá
const performance = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res);
  if (!staff) return;
  const year = parseYear(req.query.year);
  await ensureBaseHistory(staff);
  const { from, to } = yearRange(year);
  const [assignments, { get }, review] = await Promise.all([
    StaffAssignment.find({ staffId: staff._id, startDate: { $lt: to }, $or: [{ endDate: null }, { endDate: { $gt: from } }] }).populate('storeId', 'name').lean(),
    metricsFor([staff._id], year),
    StaffReview.findOne({ staffId: staff._id, year }).populate('reviewedBy', 'name').lean()
  ]);
  const m = get(staff._id);
  const stores = await Store.find({ _id: { $in: [...m.byStore.keys()] } }).select('name').lean();
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  res.json({
    data: {
      staff: { _id: staff._id, name: staff.name, email: staff.email, title: staff.title, role: staff.role },
      year,
      totals: m.totals,
      monthly: m.monthly,
      byStore: [...m.byStore.values()].map((s) => ({ ...s, name: storeName.get(s.storeId) || 'Chi nhánh đã xóa' })),
      daysByStore: daysByStore(assignments, from, to),
      review
    }
  });
});

// @route GET /api/staff/performance/summary?year= - bảng xếp hạng toàn bộ nhân viên (tính thưởng)
const performanceSummary = asyncHandler(async (req, res) => {
  const year = parseYear(req.query.year);
  const staffList = await Admin.find({ role: 'staff' }).select('name email title storeId managedStoreIds isActive').populate('storeId', 'name').lean();
  const { get } = await metricsFor(staffList.map((s) => s._id), year);
  const reviews = await StaffReview.find({ year, staffId: { $in: staffList.map((s) => s._id) } }).lean();
  const reviewMap = new Map(reviews.map((r) => [String(r.staffId), r]));
  res.json({
    data: staffList.map((s) => ({
      _id: s._id, name: s.name, email: s.email, title: s.title, isActive: s.isActive, store: s.storeId?.name || '',
      managedStores: (s.managedStoreIds || []).length,
      totals: get(s._id).totals,
      review: reviewMap.get(String(s._id)) ? { rating: reviewMap.get(String(s._id)).rating, bonus: reviewMap.get(String(s._id)).bonus } : null
    })),
    year
  });
});

// @route PUT /api/staff/:id/reviews/:year { rating, bonus, strengths, improvements } - đánh giá cuối năm
const saveReview = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res);
  if (!staff) return;
  const year = Number.parseInt(req.params.year, 10);
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) return res.status(400).json({ message: 'Năm đánh giá không hợp lệ' });
  const rating = Number(req.body.rating);
  const bonus = Number(req.body.bonus ?? 0);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Xếp loại từ 1 đến 5' });
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 10_000_000_000) return res.status(400).json({ message: 'Tiền thưởng phải là số nguyên ≥ 0' });
  const { get } = await metricsFor([staff._id], year);
  const review = await StaffReview.findOneAndUpdate(
    { staffId: staff._id, year },
    {
      $set: {
        rating, bonus,
        strengths: String(req.body.strengths || '').trim().slice(0, 1000),
        improvements: String(req.body.improvements || '').trim().slice(0, 1000),
        metricsSnapshot: get(staff._id).totals,
        reviewedBy: req.account._id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ data: review });
});

// ---------- Nhân viên theo chi nhánh (nhiều - nhiều) ----------
// 1 nhân viên làm ở nhiều chi nhánh: storeId = chi nhánh chính, managedStoreIds = các chi nhánh làm việc khác.
// 1 chi nhánh có nhiều nhân viên: gồm người có chi nhánh chính ở đây, người làm thêm ở đây, người đang điều chuyển tới.

// @route GET /api/staff/by-store/:storeId
const storeStaff = asyncHandler(async (req, res) => {
  if (!validId(req.params.storeId)) return res.status(404).json({ message: 'Không tìm thấy chi nhánh' });
  const storeId = oid(req.params.storeId);
  const now = new Date();
  const [members, transfers] = await Promise.all([
    Admin.find({ role: 'staff', $or: [{ storeId }, { managedStoreIds: storeId }] })
      .select('name email title isActive storeId managedStoreIds groupIds').populate('groupIds', 'name').populate('storeId', 'name').lean(),
    StaffAssignment.find({ storeId, kind: 'transfer', cancelled: { $ne: true }, startDate: { $lte: now }, $or: [{ endDate: null }, { endDate: { $gt: now } }] })
      .populate({ path: 'staffId', select: 'name email title isActive storeId groupIds', populate: [{ path: 'groupIds', select: 'name' }, { path: 'storeId', select: 'name' }] }).lean()
  ]);
  const rows = members.map((m) => ({
    _id: m._id, name: m.name, email: m.email, title: m.title, isActive: m.isActive, groups: (m.groupIds || []).map((g) => g.name),
    relation: String(m.storeId?._id || m.storeId) === String(storeId) ? 'home' : 'extra',
    homeStore: m.storeId?.name || '', storeCount: (m.storeId ? 1 : 0) + (m.managedStoreIds || []).length
  }));
  for (const t of transfers) {
    if (!t.staffId || rows.some((r) => String(r._id) === String(t.staffId._id))) continue;
    rows.push({
      _id: t.staffId._id, name: t.staffId.name, email: t.staffId.email, title: t.title || t.staffId.title, isActive: t.staffId.isActive,
      groups: (t.staffId.groupIds || []).map((g) => g.name), relation: 'transfer', homeStore: t.staffId.storeId?.name || '', until: t.endDate
    });
  }
  const order = { home: 0, extra: 1, transfer: 2 };
  rows.sort((a, b) => order[a.relation] - order[b.relation] || a.name.localeCompare(b.name));
  res.json({ data: rows });
});

// @route POST /api/staff/by-store/:storeId { staffId } - thêm nhân viên vào chi nhánh
// Chưa có chi nhánh chính -> đây là chi nhánh chính; đã có -> thêm vào các chi nhánh làm việc khác.
const addStaffToStore = asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  if (!validId(storeId) || !(await Store.exists({ _id: storeId, isActive: { $ne: false } }))) {
    return res.status(400).json({ message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động' });
  }
  const staff = validId(req.body.staffId) ? await Admin.findById(req.body.staffId) : null;
  if (!staff || staff.role !== 'staff') return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const before = { storeId: staff.storeId, managedStoreIds: [...(staff.managedStoreIds || [])] };
  const has = String(staff.storeId || '') === String(storeId) || (staff.managedStoreIds || []).some((m) => String(m) === String(storeId));
  if (has) return res.status(409).json({ message: `${staff.name} đã làm việc ở chi nhánh này` });
  if (!staff.storeId) staff.storeId = storeId;
  else staff.managedStoreIds.push(storeId);
  await staff.save();
  await recordStoreChanges(staff, before, req.account._id);
  disconnectAccount(req, staff._id);
  res.status(201).json({ data: { _id: staff._id, relation: String(staff.storeId) === String(storeId) ? 'home' : 'extra' } });
});

// @route DELETE /api/staff/by-store/:storeId/:staffId - nhân viên thôi làm ở chi nhánh
// Bỏ chi nhánh chính -> chi nhánh làm việc khác đầu tiên trở thành chi nhánh chính. KHÔNG cho bỏ chi nhánh cuối
// cùng: nhân viên không còn chi nhánh nào = không giới hạn chi nhánh (thấy dữ liệu toàn hệ thống).
const removeStaffFromStore = asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const staff = validId(req.params.staffId) ? await Admin.findById(req.params.staffId) : null;
  if (!staff || staff.role !== 'staff') return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const before = { storeId: staff.storeId, managedStoreIds: [...(staff.managedStoreIds || [])] };
  const isHome = String(staff.storeId || '') === String(storeId);
  const others = (staff.managedStoreIds || []).filter((m) => String(m) !== String(storeId));
  if (!isHome && others.length === (staff.managedStoreIds || []).length) {
    return res.status(400).json({ message: 'Nhân viên không làm việc ở chi nhánh này (nếu đang điều chuyển tới, hãy kết thúc điều chuyển ở hồ sơ nhân viên)' });
  }
  if (isHome && !others.length) {
    return res.status(400).json({ message: `Đây là chi nhánh duy nhất của ${staff.name}. Thêm chi nhánh khác trước, hoặc khóa tài khoản nếu nhân viên nghỉ việc.` });
  }
  if (isHome) {
    staff.storeId = others[0];
    staff.managedStoreIds = others.slice(1);
  } else {
    staff.managedStoreIds = others;
  }
  await staff.save();
  await recordStoreChanges(staff, before, req.account._id);
  disconnectAccount(req, staff._id);
  res.json({ message: 'Đã cập nhật', data: { storeId: staff.storeId } });
});

module.exports = {
  storeStaff, addStaffToStore, removeStaffFromStore,
  recordStoreChanges, ensureBaseHistory, daysByStore,
  myStores, listAssignments, createTransfer, endTransfer, performance, performanceSummary, saveReview
};
