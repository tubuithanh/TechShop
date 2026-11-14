// BÁO CÁO NHÂN VIÊN theo khoảng thời gian bất kỳ:
//  - Bán hàng (nhân viên bán hàng): đơn POS, doanh thu, số sản phẩm, giá trị TB/đơn, đơn online đã xác nhận, đánh giá của khách
//  - Giao hàng (nhân viên giao hàng): được giao, giao thành công, thất bại, tỷ lệ thành công, thời gian giao TB, tiền COD, đánh giá
//  - Bảo hành (kỹ thuật viên): phiếu xử lý, hoàn tất, thời gian xử lý TB, doanh thu sửa chữa, gói gia hạn bán được, đánh giá
// Quản lý: GET /api/staff-reports/team (cả đội, so sánh kỳ trước, bảng xếp hạng)
// Nhân viên: GET /api/staff-reports/me (báo cáo của mình + thứ hạng trong chi nhánh)
// Quản lý xem 1 người: GET /api/staff-reports/staff/:id
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');
const WarrantyCard = require('../models/WarrantyCard');
const asyncHandler = require('../utils/asyncHandler');
const { subordinateIds } = require('../utils/reportingLine'); // cấp dưới theo tuyến báo cáo

const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86400000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const r1 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10) / 10);
const DELIVERY_POSITIVE = ['Giao hàng nhanh', 'Đóng gói cẩn thận', 'Nhân viên nhiệt tình']; // thẻ khen liên quan giao hàng
const DELIVERY_NEGATIVE = ['Giao hàng chậm', 'Đóng gói sơ sài']; // thẻ chê liên quan giao hàng

// Vai trò suy ra từ chức danh (seed/generateStaff.js: TITLES)
function staffKind(s) {
  const t = String(s.title || '').toLowerCase();
  if (/quản lý/.test(t)) return 'manager';
  if (/giao hàng|shipper/.test(t)) return 'delivery';
  if (/bảo hành|kỹ thuật/.test(t)) return 'warranty';
  if (/kho/.test(t)) return 'warehouse';
  if (/bán hàng|thu ngân|tư vấn/.test(t)) return 'sales';
  return 'other';
}
// Chức danh không rõ -> dựa vào công việc thực tế nhiều nhất trong kỳ
function resolveKind(s, m) {
  const k = staffKind(s); // theo chức danh
  if (k !== 'other' || !m) return k;
  const act = [['warranty', m.warranty.tickets], ['delivery', m.delivery.assigned], ['sales', m.sales.orders + m.sales.onlineConfirmed]].sort((a, b) => b[1] - a[1]); // việc làm nhiều nhất trong kỳ
  return act[0][1] > 0 ? act[0][0] : 'other';
}
const KIND_LABEL = { sales: 'Bán hàng', delivery: 'Giao hàng', warranty: 'Bảo hành', manager: 'Quản lý', warehouse: 'Kho', other: 'Khác' };

// Khoảng thời gian: ?from=YYYY-MM-DD&to=YYYY-MM-DD (mặc định: tháng này). to tính hết ngày.
function parseRange(q) {
  const day = (v, end) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
    const d = new Date(`${v}T00:00:00+07:00`);
    return Number.isNaN(d.getTime()) ? null : end ? new Date(d.getTime() + DAY) : d;
  };
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600000);
  const monthStart = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * 3600000); // ngày 1 tháng này (giờ VN)
  let from = day(q.from, false) || monthStart; // mặc định từ đầu tháng
  let to = day(q.to, true) || new Date(Math.max(now.getTime(), from.getTime() + DAY));
  if (to <= from) to = new Date(from.getTime() + DAY);
  if (to - from > 3 * 366 * DAY) from = new Date(to.getTime() - 3 * 366 * DAY); // tối đa 3 năm
  const span = to - from;
  return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: from, bucket: span <= 62 * DAY ? 'day' : 'month' }; // kỳ trước cùng độ dài; <= 62 ngày nhóm theo ngày, dài hơn theo tháng
}
const bucketExpr = (field, bucket) => ({ $dateToString: { format: bucket === 'day' ? '%Y-%m-%d' : '%Y-%m', date: field, timezone: TZ } });
function bucketKeys(from, to, bucket) {
  const keys = [];
  const fmt = (d) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, bucket === 'day' ? 10 : 7);
  for (let t = from.getTime(); t < to.getTime(); t += bucket === 'day' ? DAY : 28 * DAY) { // bước 28 ngày để không bỏ sót tháng nào
    const k = fmt(new Date(t));
    if (keys[keys.length - 1] !== k) keys.push(k); // bỏ khóa trùng
  }
  const last = fmt(new Date(to.getTime() - 1));
  if (keys[keys.length - 1] !== last) keys.push(last);
  return keys;
}

// Đánh giá của khách gắn với đơn (Review.orderId)
const reviewLookup = { $lookup: { from: 'reviews', localField: '_id', foreignField: 'orderId', as: 'rv', pipeline: [{ $project: { rating: 1, criteria: 1, tags: 1, message: 1, createdAt: 1, displayName: 1, isAnonymous: 1 } }] } }; // nối đánh giá của đơn

// Số liệu của nhiều nhân viên trong [from, to). withSeries: kèm chuỗi thời gian; withDetail: kèm top sản phẩm + nhận xét gần đây
async function buildMetrics(ids, { from, to, bucket }, { withSeries = false, withDetail = false } = {}) {
  const inRange = { $gte: from, $lt: to };
  const sid = ids.map(oid);

  const [sales, salesItems, confirmed, deliveries, warranties, extensions] = await Promise.all([
    // Bán tại quầy: đơn do nhân viên tạo (không tính hủy / trả)
    Order.aggregate([
      { $match: { source: 'pos', createdBy: { $in: sid }, createdAt: inRange, status: { $nin: ['cancelled', 'returned'] } } },
      reviewLookup,
      { $project: { createdBy: 1, grandTotal: 1, units: { $sum: '$items.quantity' }, b: bucketExpr('$createdAt', bucket), rv: 1 } },
      { $facet: {
        totals: [{ $group: { _id: '$createdBy', orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' }, units: { $sum: '$units' } } }], // tổng đơn / doanh thu / số máy theo người bán
        series: withSeries ? [{ $group: { _id: { s: '$createdBy', b: '$b' }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } }] : [{ $match: { _id: null } }], // theo ngày / tháng
        ratings: [{ $unwind: '$rv' }, { $group: { _id: '$createdBy', n: { $sum: 1 }, rating: { $avg: '$rv.rating' }, service: { $avg: '$rv.criteria.service' }, recent: { $push: '$rv' } } }]
      } }
    ]),
    withDetail
      ? Order.aggregate([
        { $match: { source: 'pos', createdBy: { $in: sid }, createdAt: inRange, status: { $nin: ['cancelled', 'returned'] } } },
        { $unwind: '$items' },
        { $group: { _id: { s: '$createdBy', p: '$items.productId' }, name: { $first: '$items.name' }, image: { $first: '$items.image' }, units: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } } } },
        { $sort: { revenue: -1 } }
      ])
      : [],
    // Đơn online nhân viên đã xác nhận
    Order.aggregate([
      { $match: { source: { $ne: 'pos' }, 'statusHistory.changedBy': { $in: sid }, createdAt: inRange } }, // đơn online có nhân viên thao tác
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.changedBy': { $in: sid }, 'statusHistory.status': 'confirmed' } },
      { $group: { _id: { s: '$statusHistory.changedBy', o: '$_id' } } }, // mỗi đơn chỉ tính 1 lần / người
      { $group: { _id: '$_id.s', n: { $sum: 1 } } }
    ]),
    // Giao hàng: đơn được phân công cho nhân viên (đơn có vận đơn đơn vị ngoài còn hiệu lực tính cho đơn vị đó)
    Order.aggregate([
      { $match: { shipperId: { $in: sid }, createdAt: inRange } }, // đơn được phân công
      { $addFields: {
        viaCarrier: { $and: [{ $ifNull: ['$shipment.provider', false] }, { $not: [{ $in: ['$shipment.phase', ['cancelled', 'failed']] }] }] }, // đơn giao qua đơn vị vận chuyển (không tính cho shipper)
        shippedAt: { $first: { $map: { input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $eq: ['$$this.status', 'shipping'] } } }, in: '$$this.changedAt' } } },
        deliveredAt: { $first: { $map: { input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $eq: ['$$this.status', 'delivered'] } } }, in: '$$this.changedAt' } } },
        failedTries: { $size: { $filter: { input: { $ifNull: ['$deliveryAttempts', []] }, cond: { $eq: ['$$this.result', 'failed'] } } } }
      } },
      { $match: { viaCarrier: false } }, // chỉ đơn shipper tự giao
      reviewLookup,
      { $project: {
        shipperId: 1, status: 1, failedTries: 1, b: bucketExpr('$createdAt', bucket), rv: 1,
        done: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
        cod: { $cond: [{ $and: [{ $eq: ['$status', 'delivered'] }, { $eq: ['$paymentMode', 'cod'] }] }, '$grandTotal', 0] }, // tiền COD đã thu
        hours: { $cond: [{ $and: ['$shippedAt', '$deliveredAt'] }, { $divide: [{ $subtract: ['$deliveredAt', '$shippedAt'] }, 3600000] }, null] } // giờ từ lấy hàng tới giao xong
      } },
      { $facet: {
        totals: [{ $group: { _id: '$shipperId', assigned: { $sum: 1 }, delivered: { $sum: '$done' }, failedTries: { $sum: '$failedTries' }, returned: { $sum: { $cond: [{ $in: ['$status', ['returning', 'returned']] }, 1, 0] } }, pending: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'processing', 'shipping']] }, 1, 0] } }, cod: { $sum: '$cod' }, hours: { $avg: '$hours' } } }],
        series: withSeries ? [{ $group: { _id: { s: '$shipperId', b: '$b' }, delivered: { $sum: '$done' }, failed: { $sum: '$failedTries' } } }] : [{ $match: { _id: null } }],
        ratings: [{ $unwind: '$rv' }, { $addFields: { score: { $ifNull: ['$rv.criteria.delivery', '$rv.rating'] } } }, { $group: { _id: '$shipperId', n: { $sum: 1 }, score: { $avg: '$score' }, rating: { $avg: '$rv.rating' }, service: { $avg: '$rv.criteria.service' }, low: { $sum: { $cond: [{ $lte: ['$score', 2] }, 1, 0] } }, tags: { $push: '$rv.tags' }, recent: { $push: '$rv' } } }]
      } }
    ]),
    // Bảo hành: phiếu được giao cho kỹ thuật viên (assignedTo) hoặc kỹ thuật viên có cập nhật trạng thái
    Warranty.aggregate([
      { $match: { createdAt: inRange, $or: [{ assignedTo: { $in: sid } }, { 'statusHistory.changedBy': { $in: sid } }] } }, // phiếu được giao hoặc có cập nhật
      { $addFields: {
        techs: { $setIntersection: [{ $setUnion: [{ $cond: ['$assignedTo', ['$assignedTo'], []] }, { $map: { input: { $ifNull: ['$statusHistory', []] }, in: '$$this.changedBy' } }] }, sid] }, // kỹ thuật viên liên quan tới phiếu
        doneAt: { $first: { $map: { input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $in: ['$$this.status', ['done', 'returned']] } } }, in: '$$this.changedAt' } } }
      } },
      { $unwind: '$techs' }, // mỗi kỹ thuật viên được tính 1 lần cho phiếu
      { $project: {
        techs: 1, cost: 1, customerRating: 1, customerFeedback: 1, updatedAt: 1, b: bucketExpr('$createdAt', bucket),
        done: { $cond: [{ $in: ['$status', ['done', 'returned']] }, 1, 0] },
        days: { $cond: ['$doneAt', { $divide: [{ $subtract: ['$doneAt', '$createdAt'] }, DAY] }, null] }
      } },
      { $facet: {
        totals: [{ $group: { _id: '$techs', tickets: { $sum: 1 }, done: { $sum: '$done' }, days: { $avg: '$days' }, revenue: { $sum: { $ifNull: ['$cost', 0] } }, rating: { $avg: '$customerRating' }, rated: { $sum: { $cond: [{ $gt: ['$customerRating', 0] }, 1, 0] } } } }],
        series: withSeries ? [{ $group: { _id: { s: '$techs', b: '$b' }, tickets: { $sum: 1 }, done: { $sum: '$done' } } }] : [{ $match: { _id: null } }],
        feedback: withDetail ? [{ $match: { customerRating: { $gt: 0 } } }, { $sort: { updatedAt: -1 } }, { $group: { _id: '$techs', recent: { $push: { rating: '$customerRating', message: '$customerFeedback', createdAt: '$updatedAt' } } } }] : [{ $match: { _id: null } }]
      } }
    ]),
    // Gói gia hạn bảo hành bán được
    WarrantyCard.aggregate([
      { $match: { 'extensions.paidBy': { $in: sid } } }, // gói gia hạn do nhân viên bán
      { $unwind: '$extensions' },
      { $match: { 'extensions.paidBy': { $in: sid }, 'extensions.status': 'paid', 'extensions.paidAt': inRange } },
      { $group: { _id: '$extensions.paidBy', n: { $sum: 1 }, revenue: { $sum: '$extensions.price' } } }
    ])
  ]);

  const byId = (rows) => new Map(rows.map((r) => [String(r._id), r])); // mảng -> Map theo id
  const S = sales[0]; const D = deliveries[0]; const W = warranties[0];
  const sT = byId(S.totals); const sR = byId(S.ratings); const conf = byId(confirmed);
  const dT = byId(D.totals); const dR = byId(D.ratings);
  const wT = byId(W.totals); const ext = byId(extensions);
  const wF = byId(W.feedback || []);
  const keys = withSeries ? bucketKeys(from, to, bucket) : [];

  const recentOf = (list = []) => list.filter((x) => x.message || x.tags?.length)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
    .map((x) => ({ rating: x.rating, message: x.message, tags: x.tags || [], createdAt: x.createdAt, name: x.isAnonymous ? 'Khách ẩn danh' : x.displayName }));

  const out = new Map();
  for (const id of ids.map(String)) {
    const s = sT.get(id) || {}; const sr = sR.get(id) || {};
    const d = dT.get(id) || {}; const dr = dR.get(id) || {};
    const w = wT.get(id) || {}; const e = ext.get(id) || {};
    const tags = (dr.tags || []).flat();
    const m = {
      sales: {
        orders: s.orders || 0, revenue: s.revenue || 0, units: s.units || 0,
        avgOrder: s.orders ? Math.round(s.revenue / s.orders) : 0,
        onlineConfirmed: conf.get(id)?.n || 0,
        reviews: sr.n || 0, rating: r1(sr.rating), service: r1(sr.service)
      },
      delivery: {
        assigned: d.assigned || 0, delivered: d.delivered || 0, failedTries: d.failedTries || 0, returned: d.returned || 0, pending: d.pending || 0,
        successRate: d.delivered + d.failedTries ? Math.round((d.delivered / (d.delivered + d.failedTries)) * 100) : null, // % thành công trên tổng lần giao
        avgHours: r1(d.hours), cod: d.cod || 0,
        reviews: dr.n || 0, score: r1(dr.score), rating: r1(dr.rating), service: r1(dr.service), low: dr.low || 0,
        praise: tags.filter((t) => DELIVERY_POSITIVE.includes(t)).length,
        complaints: tags.filter((t) => DELIVERY_NEGATIVE.includes(t)).length
      },
      warranty: {
        tickets: w.tickets || 0, done: w.done || 0, inProgress: (w.tickets || 0) - (w.done || 0),
        doneRate: w.tickets ? Math.round((w.done / w.tickets) * 100) : null,
        avgDays: r1(w.days), revenue: w.revenue || 0, rating: r1(w.rating), reviews: w.rated || 0,
        extensions: e.n || 0, extensionRevenue: e.revenue || 0
      }
    };
    if (withSeries) {
      const pick = (rows, f) => new Map(rows.filter((r) => String(r._id.s) === id).map((r) => [r._id.b, f(r)])); // chuỗi thời gian của 1 người
      const sp = pick(S.series, (r) => r); const dp = pick(D.series, (r) => r); const wp = pick(W.series, (r) => r);
      m.series = keys.map((k) => ({
        key: k,
        revenue: sp.get(k)?.revenue || 0, orders: sp.get(k)?.orders || 0,
        delivered: dp.get(k)?.delivered || 0, failed: dp.get(k)?.failed || 0,
        tickets: wp.get(k)?.tickets || 0, ticketsDone: wp.get(k)?.done || 0
      }));
    }
    if (withDetail) {
      m.topProducts = salesItems.filter((x) => String(x._id.s) === id).slice(0, 5).map((x) => ({ productId: x._id.p, name: x.name, image: x.image, units: x.units, revenue: x.revenue }));
      m.feedback = {
        sales: recentOf(sr.recent),
        delivery: recentOf(dr.recent),
        warranty: (wF.get(id)?.recent || []).slice(0, 6)
      };
    }
    out.set(id, m);
  }
  return out;
}

// Điểm tổng hợp để xếp hạng trong cùng vai trò
const RANK_BY = {
  sales: (m) => m.sales.revenue, // bán hàng: theo doanh thu
  delivery: (m) => m.delivery.delivered * (m.delivery.score ? m.delivery.score / 5 : 0.8), // giao hàng: số đơn × điểm đánh giá
  warranty: (m) => m.warranty.done * (m.warranty.rating ? m.warranty.rating / 5 : 0.8) + m.warranty.extensions, // bảo hành: số phiếu xong × điểm + gói bán được
  manager: (m) => m.sales.revenue + m.sales.onlineConfirmed,
  warehouse: (m) => m.sales.onlineConfirmed,
  other: (m) => m.sales.revenue
};

// Phạm vi chi nhánh người xem được: admin = tất cả; quản lý = chi nhánh quản lý (+ chi nhánh mình nếu chức danh quản lý)
function managerStores(req) {
  if (req.accountRole === 'admin') return null; // null = tất cả
  const a = req.account || {};
  const ids = (a.managedStoreIds || []).map((x) => String(x._id || x)); // chi nhánh quản lý thêm
  // SỬA LỖI: trước đây chỉ nhận chức danh chứa "quản lý" -> "Cửa hàng trưởng", "Trưởng chi nhánh"... không xem được
  // chi nhánh của chính mình. Nay dùng chung cách nhận diện trưởng cửa hàng với Dashboard / Sức khỏe chi nhánh.
  const isManager = staffKind(a) === 'manager' || require('../utils/staffRole').isStoreManager({ role: 'staff', title: a.title });
  if (isManager && a.storeId) ids.push(String(a.storeId._id || a.storeId)); // + chi nhánh chính
  return [...new Set(ids)];
}


const sumBy = (list, path) => list.reduce((n, m) => n + (path.split('.').reduce((o, k) => o?.[k], m) || 0), 0); // cộng 1 trường lồng nhau ("sales.revenue") của cả đội
const avgBy = (list, path, weightPath) => { // trung bình có trọng số (VD điểm theo số đánh giá)
  let s = 0; let w = 0;
  for (const m of list) {
    const v = path.split('.').reduce((o, k) => o?.[k], m);
    const wt = weightPath.split('.').reduce((o, k) => o?.[k], m) || 0;
    if (v != null && wt) { s += v * wt; w += wt; }
  }
  return w ? r1(s / w) : null;
};
function teamTotals(list) {
  return {
    sales: { orders: sumBy(list, 'sales.orders'), revenue: sumBy(list, 'sales.revenue'), units: sumBy(list, 'sales.units'), onlineConfirmed: sumBy(list, 'sales.onlineConfirmed'), rating: avgBy(list, 'sales.rating', 'sales.reviews') },
    delivery: { assigned: sumBy(list, 'delivery.assigned'), delivered: sumBy(list, 'delivery.delivered'), failedTries: sumBy(list, 'delivery.failedTries'), cod: sumBy(list, 'delivery.cod'), score: avgBy(list, 'delivery.score', 'delivery.reviews'), avgHours: avgBy(list, 'delivery.avgHours', 'delivery.delivered'), complaints: sumBy(list, 'delivery.complaints') },
    warranty: { tickets: sumBy(list, 'warranty.tickets'), done: sumBy(list, 'warranty.done'), inProgress: sumBy(list, 'warranty.inProgress'), revenue: sumBy(list, 'warranty.revenue'), extensionRevenue: sumBy(list, 'warranty.extensionRevenue'), rating: avgBy(list, 'warranty.rating', 'warranty.reviews'), avgDays: avgBy(list, 'warranty.avgDays', 'warranty.done') }
  };
}

// @route GET /api/staff-reports/team?from&to&storeId
const teamReport = asyncHandler(async (req, res) => {
  const allowed = managerStores(req); // chi nhánh người xem quản lý
  // Người báo cáo cho tôi: trực tiếp + các cấp bên dưới
  const [directIds, allSubs] = await Promise.all([subordinateIds(req.account._id, { recursive: false }), subordinateIds(req.account._id)]); // cấp dưới trực tiếp + mọi cấp
  if (allowed && !allowed.length && !allSubs.length) return res.status(403).json({ message: 'Chỉ quản lý (chi nhánh hoặc có nhân viên báo cáo cho mình) / admin xem được báo cáo nhân viên' }); // không quản lý ai -> không xem được
  const direct = req.query.scope === 'direct';
  let filter;
  if (direct) filter = { _id: { $in: directIds } }; // chỉ người báo cáo trực tiếp
  else if (req.query.storeId) {
    if (!mongoose.isValidObjectId(req.query.storeId) || (allowed && !allowed.includes(String(req.query.storeId)))) return res.status(403).json({ message: 'Bạn không quản lý chi nhánh này' }); // chi nhánh ngoài phạm vi
    filter = { storeId: oid(req.query.storeId) };
  } else filter = allowed ? { $or: [{ storeId: { $in: allowed.map(oid) } }, { _id: { $in: allSubs } }] } : {}; // mặc định: chi nhánh quản lý + mọi cấp dưới
  const range = parseRange(req.query);
  const staff = await Admin.find({ role: 'staff', ...filter }).select('name title avatar storeId isActive managerId').populate('storeId', 'name').populate('managerId', 'name').lean();
  const directSet = new Set(directIds.map(String));
  const ids = staff.map((s) => s._id);
  const [cur, prev] = await Promise.all([buildMetrics(ids, range, { withSeries: true }), buildMetrics(ids, { from: range.prevFrom, to: range.prevTo, bucket: range.bucket })]); // kỳ này + kỳ trước
  const rows = staff.map((s) => ({ _id: s._id, name: s.name, title: s.title, avatar: s.avatar, isActive: s.isActive !== false, store: s.storeId?.name || '', manager: s.managerId?.name || '', isDirect: directSet.has(String(s._id)), kind: resolveKind(s, cur.get(String(s._id))), ...cur.get(String(s._id)), prev: prev.get(String(s._id)) }));
  // Chuỗi thời gian của cả đội
  const series = (rows[0]?.series || bucketKeys(range.from, range.to, range.bucket).map((key) => ({ key }))).map((p, i) => { // cộng chuỗi thời gian của cả đội
    const o = { key: p.key };
    for (const f of ['revenue', 'orders', 'delivered', 'failed', 'tickets', 'ticketsDone']) o[f] = rows.reduce((n, r) => n + (r.series?.[i]?.[f] || 0), 0);
    return o;
  });
  const kinds = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  res.json({
    data: {
      range: { from: range.from, to: range.to, bucket: range.bucket },
      headcount: { total: rows.length, active: rows.filter((r) => r.isActive).length, byKind: Object.entries(kinds).map(([k, n]) => ({ kind: k, label: KIND_LABEL[k], count: n })) },
      totals: teamTotals(rows), prevTotals: teamTotals(rows.map((r) => r.prev)),
      series,
      staff: rows.map(({ series: _s, ...r }) => r).sort((a, b) => RANK_BY[b.kind](b) - RANK_BY[a.kind](a)), // bỏ chuỗi riêng từng người, xếp hạng
      scope: direct ? 'direct' : allowed ? 'stores' : 'all',
      directCount: directIds.length
    }
  });
});

// Báo cáo 1 người: số liệu kỳ này, kỳ trước, chuỗi thời gian, top sản phẩm, nhận xét, thứ hạng trong chi nhánh + toàn hệ thống
async function personalReport(staff, query) {
  const range = parseRange(query);
  const storeId = staff.storeId?._id || staff.storeId;
  const peers = await Admin.find({ role: 'staff', isActive: { $ne: false } }).select('title storeId').lean(); // mọi nhân viên để xếp hạng
  const [mine, prev, peerMetrics] = await Promise.all([
    buildMetrics([staff._id], range, { withSeries: true, withDetail: true }),
    buildMetrics([staff._id], { from: range.prevFrom, to: range.prevTo, bucket: range.bucket }),
    buildMetrics(peers.map((p) => p._id), range)
  ]);
  const kind = resolveKind(staff, mine.get(String(staff._id)));
  const sameKind = peers.filter((p) => String(p._id) !== String(staff._id) && resolveKind(p, peerMetrics.get(String(p._id))) === kind); // cùng vai trò
  const m = mine.get(String(staff._id));
  const score = RANK_BY[kind];
  const rankIn = (list) => { // thứ hạng trong 1 danh sách
    const sorted = list.map((p) => ({ id: String(p._id), v: score(String(p._id) === String(staff._id) ? mine.get(String(staff._id)) : peerMetrics.get(String(p._id))) })).sort((a, b) => b.v - a.v);
    const pos = sorted.findIndex((x) => x.id === String(staff._id));
    return { rank: pos >= 0 ? pos + 1 : null, of: sorted.length };
  };
  const storePeers = [...sameKind.filter((p) => String(p.storeId) === String(storeId)), { _id: staff._id }]; // cùng vai trò + cùng chi nhánh
  sameKind.push({ _id: staff._id });
  const avgOf = (list) => teamTotals(list.map((p) => (String(p._id) === String(staff._id) ? mine : peerMetrics).get(String(p._id))).filter(Boolean));
  const per = (t, n) => (n ? Math.round(t / n) : 0);
  const storeAvg = avgOf(storePeers);
  const n = storePeers.length;
  return {
    staff: { _id: staff._id, name: staff.name, title: staff.title, avatar: staff.avatar, store: staff.storeId?.name || '', kind, kindLabel: KIND_LABEL[kind], manager: staff.managerId ? { name: staff.managerId.name, title: staff.managerId.title } : null },
    range: { from: range.from, to: range.to, bucket: range.bucket },
    metrics: { sales: m.sales, delivery: m.delivery, warranty: m.warranty },
    prev: prev.get(String(staff._id)),
    series: m.series, topProducts: m.topProducts, feedback: m.feedback,
    rank: { store: rankIn(storePeers), company: rankIn(sameKind) },
    // Trung bình 1 người cùng vai trò trong chi nhánh (để so sánh)
    storeAverage: {
      sales: { revenue: per(storeAvg.sales.revenue, n), orders: per(storeAvg.sales.orders, n), rating: storeAvg.sales.rating },
      delivery: { delivered: per(storeAvg.delivery.delivered, n), score: storeAvg.delivery.score, avgHours: storeAvg.delivery.avgHours },
      warranty: { done: per(storeAvg.warranty.done, n), rating: storeAvg.warranty.rating, avgDays: storeAvg.warranty.avgDays }
    }
  };
}

// @route GET /api/staff-reports/me
const myReport = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'staff') return res.status(403).json({ message: 'Chỉ dành cho tài khoản nhân viên' }); // chỉ nhân viên
  const me = await Admin.findById(req.account._id).select('name title avatar storeId managerId').populate('storeId', 'name').populate('managerId', 'name title').lean();
  res.json({ data: await personalReport(me, req.query) });
});

// @route GET /api/staff-reports/staff/:id - admin, hoặc quản lý của chi nhánh nhân viên đó
const staffReport = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const staff = await Admin.findOne({ _id: req.params.id, role: 'staff' }).select('name title avatar storeId managerId').populate('storeId', 'name').populate('managerId', 'name title').lean();
  if (!staff) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  if (!(await canViewStaff(req, staff))) return res.status(403).json({ message: 'Bạn không quản lý nhân viên này' });
  res.json({ data: await personalReport(staff, req.query) });
});

// Người xem có được xem báo cáo của nhân viên `staff` không: admin; chính mình; cấp dưới; nhân viên thuộc chi nhánh mình quản lý.
// manage = true: chỉ tính quyền QUẢN LÝ (bỏ trường hợp "chính mình") - dùng cho việc đặt chỉ tiêu.
async function canViewStaff(req, staff, { manage = false } = {}) {
  const allowed = managerStores(req); // null = admin (mọi chi nhánh)
  if (!allowed) return true;
  const isSelf = String(req.account._id) === String(staff._id); // xem của chính mình
  if (isSelf) return !manage;
  const isSub = (await subordinateIds(req.account._id)).some((x) => String(x) === String(staff._id)); // là cấp dưới của người xem
  return isSub || allowed.includes(String(staff.storeId?._id || staff.storeId)); // hoặc cùng chi nhánh mình quản lý
}

module.exports = { teamReport, myReport, staffReport, staffKind, parseRange, buildMetrics, canViewStaff };
