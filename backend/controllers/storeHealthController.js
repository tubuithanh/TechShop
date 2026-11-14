// BÁO CÁO SỨC KHỎE CHI NHÁNH / TECHSHOP: chấm điểm 0-100 theo 6 nhóm (có trọng số), so với kỳ trước, kèm vấn đề cần xử lý.
//   Doanh thu 25% · Khách hàng 25% · Vận hành 20% · Tồn kho 15% · Con người 10% · Rủi ro 5%
// 1 chi nhánh -> báo cáo chi nhánh; nhiều chi nhánh -> sức khỏe TechShop (gộp) + xếp hạng từng chi nhánh.
// Phạm vi: admin = mọi chi nhánh; quản lý = chi nhánh mình quản lý.
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Admin = require('../models/Admin');
const StoreInventory = require('../models/StoreInventory');
const Review = require('../models/Review');
const Warranty = require('../models/Warranty');
const asyncHandler = require('../utils/asyncHandler');
const { TAGS } = require('../utils/reviewCriteria');

const DAY = 86400000; // số mili giây trong 1 ngày
const oid = (v) => new mongoose.Types.ObjectId(String(v)); // chuỗi -> ObjectId (aggregate cần)
const r1 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10); // làm tròn 1 chữ số thập phân; không hợp lệ -> null
// Điểm tuyến tính: giá trị bằng `bad` -> 0 điểm, bằng `good` -> 100 điểm (tự hiểu chiều tốt/xấu)
const lin = (v, bad, good) => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.min(100, ((v - bad) / (good - bad)) * 100)));
const avg = (list) => { const x = list.filter((v) => v != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; }; // trung bình, bỏ qua giá trị null (không có dữ liệu)
const WEIGHTS = { revenue: 25, customer: 25, operations: 20, inventory: 15, people: 10, risk: 5 }; // trọng số 6 nhóm, tổng 100
const GROUP_LABEL = { revenue: 'Doanh thu', customer: 'Khách hàng', operations: 'Vận hành', inventory: 'Tồn kho', people: 'Con người', risk: 'Rủi ro' };
const level = (s) => (s == null ? 'unknown' : s >= 75 ? 'good' : s >= 55 ? 'watch' : 'alert'); // >= 75 tốt, >= 55 cần theo dõi, còn lại báo động

function parseRange(q) {
  const day = (v, end) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null; // chỉ nhận YYYY-MM-DD
    const d = new Date(`${v}T00:00:00+07:00`); // 0 giờ theo giờ VN
    return Number.isNaN(d.getTime()) ? null : end ? new Date(d.getTime() + DAY) : d;
  };
  const to = day(q.to, true) || new Date(); // mặc định tới hiện tại
  let from = day(q.from, false) || new Date(to.getTime() - 30 * DAY); // mặc định 30 ngày
  if (to - from > 366 * DAY) from = new Date(to.getTime() - 366 * DAY); // tối đa 1 năm
  if (to <= from) from = new Date(to.getTime() - DAY);
  return { from, to, prevFrom: new Date(from.getTime() - (to - from)), prevTo: from, days: Math.max(1, Math.round((to - from) / DAY)) }; // kỳ trước = cùng độ dài, ngay trước kỳ này
}

const titleKind = (t = '') => (/quản lý/i.test(t) ? 'manager' : /giao hàng/i.test(t) ? 'delivery' : /bảo hành|kỹ thuật/i.test(t) ? 'warranty' : /bán hàng|thu ngân|tư vấn/i.test(t) ? 'sales' : 'other'); // chức danh -> loại nhân sự

// Số liệu thô theo chi nhánh trong [from, to). storeIds: mảng ObjectId
async function rawMetrics(storeIds, from, to) {
  const inRange = { $gte: from, $lt: to }; // trong kỳ
  const now = new Date();
  const [orders, reviews, warranties, inventory, sold, staff, cod] = await Promise.all([
    Order.aggregate([
      { $match: { storeId: { $in: storeIds }, createdAt: inRange } },
      { $addFields: {
        confirmedAt: { $first: { $map: { input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $eq: ['$$this.status', 'confirmed'] } } }, in: '$$this.changedAt' } } }, // lần xác nhận đầu tiên trong lịch sử
        failedTries: { $size: { $filter: { input: { $ifNull: ['$deliveryAttempts', []] }, cond: { $eq: ['$$this.result', 'failed'] } } } } // số lần giao thất bại
      } },
      { $group: {
        _id: '$storeId',
        orders: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$grandTotal', 0] } },
        discount: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, { $ifNull: ['$discountAmount', 0] }, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        returned: { $sum: { $cond: [{ $in: ['$status', ['returning', 'returned']] }, 1, 0] } },
        pos: { $sum: { $cond: [{ $eq: ['$source', 'pos'] }, 1, 0] } },
        online: { $sum: { $cond: [{ $ne: ['$source', 'pos'] }, 1, 0] } },
        // Xác nhận đơn online trong 2 giờ
        confirmFast: { $sum: { $cond: [{ $and: [{ $ne: ['$source', 'pos'] }, '$confirmedAt', { $lte: [{ $subtract: ['$confirmedAt', '$createdAt'] }, 2 * 3600000] }] }, 1, 0] } },
        confirmTotal: { $sum: { $cond: [{ $and: [{ $ne: ['$source', 'pos'] }, '$confirmedAt'] }, 1, 0] } },
        homeDone: { $sum: { $cond: [{ $and: [{ $eq: ['$deliveryMethod', 'home_delivery'] }, { $eq: ['$status', 'delivered'] }] }, 1, 0] } },
        homeFirstTry: { $sum: { $cond: [{ $and: [{ $eq: ['$deliveryMethod', 'home_delivery'] }, { $eq: ['$status', 'delivered'] }, { $eq: ['$failedTries', 0] }] }, 1, 0] } },
        express: { $sum: { $cond: [{ $ifNull: ['$express.windowId', false] }, 1, 0] } },
        expressOnTime: { $sum: { $cond: [{ $and: [{ $ifNull: ['$express.deliveredAt', false] }, { $lte: ['$express.deliveredAt', '$express.deadline'] }] }, 1, 0] } },
        expressLate: { $sum: { $cond: [{ $and: [{ $ifNull: ['$express.deadline', false] }, { $or: [{ $gt: ['$express.deliveredAt', '$express.deadline'] }, { $and: [{ $not: [{ $in: ['$status', ['delivered', 'cancelled']] }] }, { $lt: ['$express.deadline', now] }] }] }] }, 1, 0] } },
        refundsPending: { $sum: { $cond: [{ $in: ['$refundStatus', ['pending', 'processing']] }, 1, 0] } },
        customers: { $addToSet: '$userId' } // danh sách khách (tính khách quay lại)
      } }
    ]),
    // Đánh giá của đơn thuộc chi nhánh
    Review.aggregate([
      { $match: { createdAt: inRange, orderId: { $ne: null } } },
      { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'o', pipeline: [{ $project: { storeId: 1 } }] } },
      { $addFields: { storeId: { $first: '$o.storeId' } } },
      { $match: { storeId: { $in: storeIds } } },
      { $group: { _id: '$storeId', n: { $sum: 1 }, rating: { $avg: '$rating' }, delivery: { $avg: '$criteria.delivery' }, service: { $avg: '$criteria.service' },
        negative: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: [{ $ifNull: ['$tags', []] }, TAGS.negative] } }, 0] }, 1, 0] } }, // đánh giá có ít nhất 1 thẻ chê
        unreplied: { $sum: { $cond: [{ $and: [{ $lte: ['$rating', 3] }, { $eq: [{ $strLenCP: { $ifNull: ['$reply.content', ''] } }, 0] }] }, 1, 0] } } } } // đánh giá <= 3 sao chưa trả lời
    ]),
    // Bảo hành (chi nhánh của đơn mua)
    Warranty.aggregate([
      { $match: { $or: [{ createdAt: inRange }, { status: { $nin: ['done', 'returned'] } }] } }, // phiếu trong kỳ + phiếu còn mở
      { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'o', pipeline: [{ $project: { storeId: 1 } }] } },
      { $addFields: { storeId: { $first: '$o.storeId' }, doneAt: { $first: { $map: { input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $in: ['$$this.status', ['done', 'returned']] } } }, in: '$$this.changedAt' } } } } },
      { $match: { storeId: { $in: storeIds } } },
      { $group: { _id: '$storeId',
        open: { $sum: { $cond: [{ $in: ['$status', ['done', 'returned']] }, 0, 1] } },
        openOld: { $sum: { $cond: [{ $and: [{ $not: [{ $in: ['$status', ['done', 'returned']] }] }, { $lt: ['$createdAt', new Date(now - 7 * DAY)] }] }, 1, 0] } }, // mở quá 7 ngày
        days: { $avg: { $cond: [{ $and: ['$doneAt', { $gte: ['$createdAt', from] }] }, { $divide: [{ $subtract: ['$doneAt', '$createdAt'] }, DAY] }, null] } }, // số ngày xử lý trung bình
        rating: { $avg: '$customerRating' } } }
    ]),
    // Tồn kho hiện tại
    StoreInventory.aggregate([
      { $match: { storeId: { $in: storeIds } } },
      { $group: { _id: '$storeId', skus: { $sum: 1 }, inStock: { $sum: { $cond: [{ $gt: ['$stock', 0] }, 1, 0] } }, units: { $sum: '$stock' },
        low: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] }] }, 1, 0] } }, // còn ít (<= ngưỡng)
        variants: { $push: { v: '$variantId', s: '$stock' } } } } // để tìm hàng tồn không bán được
    ]),
    // Phiên bản đã bán trong kỳ (theo chi nhánh) -> hàng tồn không bán được
    Order.aggregate([
      { $match: { storeId: { $in: storeIds }, createdAt: inRange, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: { _id: { s: '$storeId', v: '$items.variantId' }, q: { $sum: '$items.quantity' } } } // phiên bản đã bán trong kỳ
    ]),
    Admin.find({ role: 'staff', isActive: { $ne: false }, storeId: { $in: storeIds } }).select('title storeId').lean(), // nhân viên chính thức
    // COD shipper giữ quá 2 ngày chưa nộp
    Order.aggregate([
      { $match: { storeId: { $in: storeIds }, paymentMode: 'cod', codCollectedAt: { $ne: null, $lt: new Date(now - 2 * DAY) }, codSettledAt: null } }, // COD giữ quá 2 ngày
      { $group: { _id: '$storeId', n: { $sum: 1 }, amount: { $sum: '$grandTotal' } } }
    ])
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  return { orders: by(orders), reviews: by(reviews), warranties: by(warranties), inventory: by(inventory), sold, staff, cod: by(cod) };
}

// Khách quay lại: khách của kỳ này đã từng mua tại chi nhánh trước kỳ
async function repeatRate(storeId, customers, from) {
  const ids = (customers || []).filter(Boolean); // bỏ khách lẻ (không tài khoản)
  if (!ids.length) return null;
  const old = await Order.distinct('userId', { storeId, userId: { $in: ids }, createdAt: { $lt: from } }); // khách đã mua trước kỳ
  return (old.length / ids.length) * 100; // % khách quay lại
}

// Chấm điểm 1 "đơn vị" (1 chi nhánh hoặc toàn TechShop) từ số liệu đã gộp
function score(m, p, topMissing) {
  const pct = (a, b) => (b ? (a / b) * 100 : null); // phần trăm, mẫu 0 -> null
  const growth = p.revenue ? ((m.revenue - p.revenue) / p.revenue) * 100 : m.revenue ? 100 : null; // % tăng trưởng doanh thu so với kỳ trước
  const k = {
    revenue: m.revenue, revenuePrev: p.revenue, growth: r1(growth), orders: m.orders, ordersPrev: p.orders,
    aov: m.delivered ? Math.round(m.revenue / m.delivered) : 0, aovPrev: p.delivered ? Math.round(p.revenue / p.delivered) : 0,
    discountRate: r1(pct(m.discount, m.revenue + m.discount)),
    rating: r1(m.rating), ratingPrev: r1(p.rating), reviews: m.reviewCount, complaintRate: r1(pct(m.negative, m.reviewCount)),
    unrepliedBad: m.unreplied, repeatRate: r1(m.repeat), deliveryScore: r1(m.deliveryCrit),
    confirmFastRate: r1(pct(m.confirmFast, m.confirmTotal)), cancelRate: r1(pct(m.cancelled, m.orders)), returnRate: r1(pct(m.returned, m.delivered)),
    firstTryRate: r1(pct(m.homeFirstTry, m.homeDone)), express: m.express, expressLate: m.expressLate, expressOnTimeRate: r1(pct(m.expressOnTime, m.expressOnTime + m.expressLate)),
    warrantyOpen: m.warrantyOpen, warrantyOld: m.warrantyOld, warrantyDays: r1(m.warrantyDays), warrantyRating: r1(m.warrantyRating),
    inStockRate: r1(pct(m.inStock, m.skus)), lowStock: m.low, deadStockRate: r1(pct(m.dead, m.inStock)), topMissing: topMissing.length,
    staff: m.staff, staffByKind: m.staffByKind, revenuePerStaff: m.staff ? Math.round(m.revenue / m.staff) : 0,
    codHeld: m.codN, codHeldAmount: m.codAmount, refundsPending: m.refundsPending
  };
  const g = {
    revenue: avg([lin(growth, -25, 15), lin(k.discountRate, 25, 5)]), // giảm 25% = 0 điểm, tăng 15% = 100; giảm giá 25% = 0, 5% = 100
    customer: avg([lin(k.rating, 3, 4.7), lin(k.complaintRate, 25, 3), lin(k.repeatRate, 5, 40), lin(k.deliveryScore, 3, 4.7)]), // 3★ = 0, 4.7★ = 100; phàn nàn 25% = 0, 3% = 100...
    operations: avg([lin(k.confirmFastRate, 50, 95), lin(k.cancelRate, 20, 3), lin(k.returnRate, 8, 1), lin(k.firstTryRate, 75, 97), k.express ? lin(k.expressOnTimeRate, 70, 98) : null, lin(k.warrantyOld, 10, 0)]), // xác nhận nhanh, hủy, trả, giao lần đầu, hỏa tốc, bảo hành tồn
    inventory: avg([lin(k.inStockRate, 60, 95), lin(k.deadStockRate, 70, 20), lin(topMissing.length, 6, 0)]), // tỷ lệ còn hàng, hàng tồn chậm, thiếu hàng bán chạy
    people: avg([
      ['sales', 'delivery', 'warranty', 'manager'].filter((x) => m.staffByKind[x] > 0).length * 25, // đủ 4 vị trí = 100
      m.staff ? lin(m.revenue / m.staff / (m.days / 30), 30e6, 250e6) : 0 // doanh thu / người / tháng: 30 tr = 0, 250 tr = 100
    ]),
    risk: avg([lin(m.codN, 10, 0), lin(m.refundsPending, 15, 0), lin(k.unrepliedBad, 15, 0)]) // COD giữ lâu, chờ hoàn tiền, đánh giá xấu chưa trả lời
  };
  let total = 0; let w = 0;
  for (const [key, val] of Object.entries(g)) if (val != null) { total += val * WEIGHTS[key]; w += WEIGHTS[key]; } // nhóm không có dữ liệu thì bỏ khỏi trọng số
  const overall = w ? Math.round(total / w) : null; // điểm tổng 0-100

  // Vấn đề cần xử lý (mức ảnh hưởng: 3 = nghiêm trọng)
  const issues = [];
  const add = (sev, group, text, action) => issues.push({ severity: sev, group, text, action }); // thêm 1 vấn đề + gợi ý hành động
  if (growth != null && growth <= -10) add(growth <= -25 ? 3 : 2, 'revenue', `Doanh thu giảm ${Math.abs(r1(growth))}% so với kỳ trước`, 'Xem lại khuyến mãi, hàng chủ lực còn đủ không');
  if (k.discountRate >= 15) add(2, 'revenue', `Giảm giá chiếm ${k.discountRate}% doanh thu`, 'Rà soát chương trình khuyến mãi / voucher đang chạy');
  if (k.rating != null && k.rating < 4) add(k.rating < 3.5 ? 3 : 2, 'customer', `Điểm đánh giá trung bình ${k.rating}★`, 'Đọc các đánh giá thấp và phản hồi khách');
  if (k.complaintRate >= 12) add(2, 'customer', `${k.complaintRate}% đánh giá có phàn nàn (giao chậm, đóng gói...)`, 'Lọc đánh giá "Có thẻ chê" để xử lý');
  if (k.deliveryScore != null && k.deliveryScore < 3.8) add(2, 'customer', `Khách chấm giao hàng ${k.deliveryScore}★`, 'Xem xếp hạng nhân viên giao hàng');
  if (k.confirmFastRate != null && k.confirmFastRate < 80) add(2, 'operations', `Chỉ ${k.confirmFastRate}% đơn online được xác nhận trong 2 giờ`, 'Theo dõi hộp "Việc cần làm" của đơn hàng');
  if (k.cancelRate >= 10) add(2, 'operations', `Tỷ lệ hủy đơn ${k.cancelRate}%`, 'Xem lý do hủy trong danh sách đơn');
  if (k.firstTryRate != null && k.firstTryRate < 88) add(2, 'operations', `Chỉ ${k.firstTryRate}% đơn giao thành công ngay lần đầu`, 'Gọi khách trước khi giao, kiểm tra địa chỉ');
  if (k.expressLate > 0) add(k.expressLate >= 3 ? 3 : 2, 'operations', `${k.expressLate} đơn hỏa tốc trễ hạn`, 'Giảm bán kính / số suất khung hỏa tốc hoặc thêm shipper');
  if (k.warrantyOld > 0) add(k.warrantyOld >= 5 ? 3 : 2, 'operations', `${k.warrantyOld} phiếu bảo hành tồn quá 7 ngày`, 'Ưu tiên phiếu chờ linh kiện / liên hệ hãng');
  if (topMissing.length) add(topMissing.length >= 3 ? 3 : 2, 'inventory', `Hết hàng ${topMissing.length} sản phẩm bán chạy: ${topMissing.slice(0, 3).join(', ')}${topMissing.length > 3 ? '…' : ''}`, 'Nhập thêm hoặc điều chuyển hàng từ chi nhánh khác');
  if (k.deadStockRate >= 55) add(1, 'inventory', `${k.deadStockRate}% mặt hàng còn tồn nhưng không bán được trong kỳ`, 'Chạy khuyến mãi xả hàng tồn chậm');
  if (k.lowStock >= 15) add(1, 'inventory', `${k.lowStock} phiên bản sắp hết hàng`, 'Lên kế hoạch nhập hàng');
  const missingRoles = { sales: 'bán hàng', delivery: 'giao hàng', warranty: 'kỹ thuật viên', manager: 'quản lý' };
  const lack = Object.keys(missingRoles).filter((x) => !(m.staffByKind[x] > 0));
  if (lack.length && m.staff !== undefined && !m.company) add(lack.includes('delivery') || lack.includes('manager') ? 3 : 2, 'people', `Thiếu nhân sự: ${lack.map((x) => missingRoles[x]).join(', ')}`, 'Tuyển / điều chuyển nhân viên tạm thời');
  if (m.codN > 0) add(m.codN >= 5 ? 2 : 1, 'risk', `${m.codN} khoản COD (${Math.round(m.codAmount / 1e6)} tr) shipper giữ quá 2 ngày chưa nộp`, 'Đối soát COD trong trang Phân công giao hàng');
  if (m.refundsPending > 0) add(m.refundsPending >= 5 ? 2 : 1, 'risk', `${m.refundsPending} đơn chờ hoàn tiền`, 'Xác nhận hoàn tiền cho khách');
  if (k.unrepliedBad > 0) add(1, 'risk', `${k.unrepliedBad} đánh giá ≤3★ chưa phản hồi`, 'Trả lời khách trong trang Đánh giá');
  issues.sort((a, b) => b.severity - a.severity); // nghiêm trọng lên đầu

  const strengths = [];
  if (growth >= 10) strengths.push(`Doanh thu tăng ${r1(growth)}%`);
  if (k.rating >= 4.5) strengths.push(`Khách đánh giá ${k.rating}★`);
  if (k.firstTryRate >= 95) strengths.push(`${k.firstTryRate}% giao thành công ngay lần đầu`);
  if (k.repeatRate >= 30) strengths.push(`${k.repeatRate}% khách quay lại`);
  if (k.inStockRate >= 92 && !topMissing.length) strengths.push('Đủ hàng bán chạy');
  if (k.express && k.expressOnTimeRate >= 95) strengths.push(`Hỏa tốc đúng hạn ${k.expressOnTimeRate}%`);

  return {
    score: overall, level: level(overall),
    groups: Object.entries(g).map(([key, v]) => ({ key, label: GROUP_LABEL[key], weight: WEIGHTS[key], score: v == null ? null : Math.round(v), level: level(v) })),
    kpi: k, issues, strengths
  };
}

// Gộp số liệu thô của 1 hoặc nhiều chi nhánh thành 1 đơn vị
function combine(ids, raw, extra) {
  const m = { orders: 0, delivered: 0, revenue: 0, discount: 0, cancelled: 0, returned: 0, confirmFast: 0, confirmTotal: 0, homeDone: 0, homeFirstTry: 0,
    express: 0, expressOnTime: 0, expressLate: 0, refundsPending: 0, reviewCount: 0, negative: 0, unreplied: 0, warrantyOpen: 0, warrantyOld: 0,
    skus: 0, inStock: 0, low: 0, dead: 0, codN: 0, codAmount: 0, staff: 0, staffByKind: {}, customers: [] };
  const wavg = { rating: [0, 0], deliveryCrit: [0, 0], warrantyDays: [0, 0], warrantyRating: [0, 0] };
  const soldSet = new Set(raw.sold.map((s) => `${s._id.s}:${s._id.v}`)); // tập "chiNhanh:phienBan" đã bán
  for (const id of ids.map(String)) {
    const o = raw.orders.get(id) || {};
    for (const f of ['orders', 'delivered', 'revenue', 'discount', 'cancelled', 'returned', 'confirmFast', 'confirmTotal', 'homeDone', 'homeFirstTry', 'express', 'expressOnTime', 'expressLate', 'refundsPending']) m[f] += o[f] || 0; // cộng dồn các chỉ số đếm
    m.customers.push(...(o.customers || []));
    const r = raw.reviews.get(id);
    if (r) { m.reviewCount += r.n; m.negative += r.negative; m.unreplied += r.unreplied; wavg.rating[0] += r.rating * r.n; wavg.rating[1] += r.n; if (r.delivery) { wavg.deliveryCrit[0] += r.delivery * r.n; wavg.deliveryCrit[1] += r.n; } } // điểm trung bình có trọng số theo số đánh giá
    const w = raw.warranties.get(id);
    if (w) { m.warrantyOpen += w.open; m.warrantyOld += w.openOld; if (w.days != null) { wavg.warrantyDays[0] += w.days; wavg.warrantyDays[1] += 1; } if (w.rating != null) { wavg.warrantyRating[0] += w.rating; wavg.warrantyRating[1] += 1; } }
    const inv = raw.inventory.get(id);
    if (inv) { m.skus += inv.skus; m.inStock += inv.inStock; m.low += inv.low; m.dead += inv.variants.filter((x) => x.s > 0 && !soldSet.has(`${id}:${x.v}`)).length; } // dead = còn hàng nhưng không bán được trong kỳ
    const c = raw.cod.get(id);
    if (c) { m.codN += c.n; m.codAmount += c.amount; }
    for (const s of raw.staff.filter((x) => String(x.storeId) === id)) { m.staff += 1; const k = titleKind(s.title); m.staffByKind[k] = (m.staffByKind[k] || 0) + 1; } // đếm nhân viên theo loại
  }
  for (const [k, [s, n]] of Object.entries(wavg)) m[k] = n ? s / n : null; // chia ra trung bình
  return Object.assign(m, extra);
}

// Sản phẩm bán chạy toàn hệ thống (kỳ này) mà chi nhánh đang hết hàng
async function topSellersMissing(storeIds, from, to) {
  const top = await Order.aggregate([
    { $match: { createdAt: { $gte: from, $lt: to }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', q: { $sum: '$items.quantity' }, name: { $first: '$items.name' } } },
    { $sort: { q: -1 } }, { $limit: 15 } // top 15 bán chạy toàn hệ thống
  ]);
  const stock = await StoreInventory.aggregate([
    { $match: { storeId: { $in: storeIds }, productId: { $in: top.map((t) => t._id) } } },
    { $group: { _id: { s: '$storeId', p: '$productId' }, stock: { $sum: '$stock' } } }
  ]);
  const has = new Map(stock.map((x) => [`${x._id.s}:${x._id.p}`, x.stock]));
  const result = new Map();
  for (const s of storeIds.map(String)) result.set(s, top.filter((t) => !(has.get(`${s}:${t._id}`) > 0)).map((t) => t.name)); // chi nhánh hết hàng sản phẩm nào
  return result;
}

// @route GET /api/store-health?from&to&storeId
const getStoreHealth = asyncHandler(async (req, res) => {
  // Phạm vi chi nhánh người xem được
  let allowed = null;
  // CHỈ admin hoặc TRƯỞNG CỬA HÀNG (theo chức danh) - nhân viên khác dù làm nhiều chi nhánh cũng không xem được số liệu tài chính
  if (req.accountRole !== 'admin') { // không phải admin -> kiểm tra trưởng cửa hàng
    const a = req.account || {};
    if (!require('../utils/staffRole').isStoreManager({ role: req.accountRole, title: a.title })) return res.status(403).json({ message: 'Chỉ admin hoặc trưởng cửa hàng được xem báo cáo sức khỏe chi nhánh' });
    allowed = [...new Set([...(a.storeId ? [String(a.storeId._id || a.storeId)] : []), ...(a.managedStoreIds || []).map((x) => String(x._id || x))])]; // chi nhánh chính + chi nhánh quản lý thêm
    if (!allowed.length) return res.status(403).json({ message: 'Tài khoản trưởng cửa hàng chưa được gắn chi nhánh' });
  }
  if (req.query.storeId && (!mongoose.isValidObjectId(req.query.storeId) || (allowed && !allowed.includes(String(req.query.storeId))))) return res.status(403).json({ message: 'Bạn không quản lý chi nhánh này' }); // không được xem chi nhánh ngoài phạm vi
  const storeFilter = { isActive: { $ne: false }, ...(req.query.storeId ? { _id: req.query.storeId } : allowed ? { _id: { $in: allowed.map(oid) } } : {}) };
  const stores = await Store.find(storeFilter).select('name city address').sort({ name: 1 }).lean();
  if (!stores.length) return res.status(404).json({ message: 'Không có chi nhánh đang hoạt động trong phạm vi' });
  const ids = stores.map((s) => s._id);
  const range = parseRange(req.query);
  const [cur, prev, missing] = await Promise.all([rawMetrics(ids, range.from, range.to), rawMetrics(ids, range.prevFrom, range.prevTo), topSellersMissing(ids, range.from, range.to)]); // kỳ này, kỳ trước, hàng bán chạy đang thiếu

  const build = async (list, company) => {
    const m = combine(list, cur, { days: range.days, company }); // số liệu kỳ này
    const p = combine(list, prev, { days: range.days, company }); // số liệu kỳ trước
    m.repeat = list.length === 1 ? await repeatRate(list[0], m.customers, range.from) : avg(await Promise.all(list.map((id) => repeatRate(id, (cur.orders.get(String(id)) || {}).customers, range.from))));
    const miss = list.length === 1 ? missing.get(String(list[0])) : [...new Set([].concat(...list.map((id) => missing.get(String(id)))))].filter((name) => list.every((id) => missing.get(String(id)).includes(name))); // toàn hệ thống: chỉ tính sản phẩm MỌI chi nhánh đều hết
    return score(m, p, miss);
  };
  const perStore = [];
  for (const s of stores) perStore.push({ store: s, ...(await build([s._id], false)) }); // điểm từng chi nhánh
  perStore.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)); // xếp hạng cao -> thấp
  const overview = stores.length > 1 ? await build(ids, true) : null; // nhiều chi nhánh -> điểm gộp TechShop
  // Doanh thu theo ngày / tháng của từng chi nhánh (biểu đồ xu hướng)
  const bucket = range.days <= 62 ? '%Y-%m-%d' : '%Y-%m'; // kỳ ngắn: theo ngày; dài: theo tháng
  const trend = await Order.aggregate([
    { $match: { storeId: { $in: ids }, createdAt: { $gte: range.from, $lt: range.to }, status: 'delivered' } },
    { $group: { _id: { k: { $dateToString: { format: bucket, date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, s: '$storeId' }, revenue: { $sum: '$grandTotal' } } },
    { $sort: { '_id.k': 1 } }
  ]);
  res.json({
    data: {
      mode: stores.length > 1 ? 'company' : 'store',
      range: { from: range.from, to: range.to, days: range.days },
      weights: WEIGHTS,
      overview: overview || perStore[0],
      stores: perStore,
      trend: trend.map((t) => ({ key: t._id.k, storeId: t._id.s, revenue: t.revenue })),
      allowedStores: (allowed ? await Store.find({ _id: { $in: allowed.map(oid) } }).select('name').lean() : await Store.find({ isActive: { $ne: false } }).select('name').lean())
    }
  });
});

module.exports = { getStoreHealth, score, parseRange };
