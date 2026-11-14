// =====================================================================================================
// PHÂN TÍCH BÁN HÀNG CHI TIẾT của 1 nhân viên bán tại quầy (bổ sung cho "Báo cáo của tôi"):
//   - Chỉ tiêu tháng: tiến độ, dự báo cuối tháng theo tốc độ hiện tại, cần bán thêm mỗi ngày
//   - Khung giờ bán (thứ × giờ), giờ bán đắt nhất
//   - Cơ cấu doanh thu theo danh mục / phương thức thanh toán
//   - Khách hàng: số khách, khách mới / quay lại, khách lẻ, top khách
//   - Chất lượng: tỷ lệ hủy / trả, mức giảm giá đã cho, tỷ lệ đơn dùng mã
//   - Đơn gần đây
// Doanh thu tính như báo cáo nhân viên: đơn bán tại quầy do nhân viên tạo, KHÔNG tính đơn hủy / trả.
// Quyền xem giống báo cáo nhân viên (chính mình / cấp dưới / chi nhánh mình quản lý / admin).
// =====================================================================================================
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Order = require('../models/Order');
const SalesTarget = require('../models/SalesTarget');
const asyncHandler = require('../utils/asyncHandler');
const { parseRange, canViewStaff } = require('./staffReportController');

const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86400000;
const VALID = { $nin: ['cancelled', 'returned'] }; // đơn tính doanh thu
const PAY_LABEL = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', cod: 'COD', vnpay: 'VNPay', momo: 'MoMo' };

// Tháng hiện tại theo giờ VN: khóa "YYYY-MM", mốc đầu tháng / đầu tháng sau, số ngày đã qua / cả tháng
function vnMonth(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600000); // giờ VN
  const y = vn.getUTCFullYear(); const m = vn.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - 7 * 3600000); // 0 giờ ngày 1 (giờ VN)
  const end = new Date(Date.UTC(y, m + 1, 1) - 7 * 3600000); // 0 giờ ngày 1 tháng sau
  const daysInMonth = Math.round((end - start) / DAY);
  const daysElapsed = Math.min(daysInMonth, Math.max(1, Math.ceil((now - start) / DAY))); // tính cả hôm nay
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, start, end, daysInMonth, daysElapsed };
}

// Tiến độ chỉ tiêu tháng hiện tại
async function targetProgress(staffId) {
  const mo = vnMonth();
  const [target, [row]] = await Promise.all([
    SalesTarget.findOne({ staffId, month: mo.key }).lean(),
    Order.aggregate([
      { $match: { source: 'pos', createdBy: staffId, status: VALID, createdAt: { $gte: mo.start, $lt: mo.end } } },
      { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } }
    ])
  ]);
  const revenue = row?.revenue || 0;
  const orders = row?.orders || 0;
  const forecast = Math.round((revenue / mo.daysElapsed) * mo.daysInMonth); // giữ tốc độ hiện tại tới cuối tháng
  const daysLeft = mo.daysInMonth - mo.daysElapsed; // không tính hôm nay
  const amount = target?.amount || 0;
  return {
    month: mo.key, daysInMonth: mo.daysInMonth, daysElapsed: mo.daysElapsed, daysLeft,
    revenue, orders, forecast,
    target: target ? { amount, orders: target.orders || 0, setByName: target.setByName, updatedAt: target.updatedAt } : null,
    percent: amount ? Math.round((revenue / amount) * 1000) / 10 : null, // % đã đạt
    forecastPercent: amount ? Math.round((forecast / amount) * 1000) / 10 : null, // % dự báo cuối tháng
    needPerDay: amount && revenue < amount ? Math.ceil((amount - revenue) / Math.max(1, daysLeft + 1)) : 0 // cần bán / ngày còn lại (gồm hôm nay)
  };
}

// Số liệu phân tích trong khoảng [from, to)
async function insights(staffId, { from, to }) {
  const base = { source: 'pos', createdBy: staffId, createdAt: { $gte: from, $lt: to } }; // mọi đơn của nhân viên trong kỳ
  const valid = { ...base, status: VALID };
  const [quality, heat, payment, category, customers, recent] = await Promise.all([
    // Chất lượng: tổng đơn, hủy, trả, tiền hàng, tiền giảm, đơn dùng mã
    Order.aggregate([
      { $match: base },
      { $group: {
        _id: null, total: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        returned: { $sum: { $cond: [{ $in: ['$status', ['returning', 'returned']] }, 1, 0] } },
        itemsTotal: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, '$itemsTotal'] } },
        discount: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'returned']] }, 0, { $ifNull: ['$discountAmount', 0] }] } },
        withVoucher: { $sum: { $cond: [{ $and: [{ $not: [{ $in: ['$status', ['cancelled', 'returned']] }] }, { $gt: [{ $strLenCP: { $ifNull: ['$voucherCode', ''] } }, 0] }] }, 1, 0] } }
      } }
    ]),
    // Khung giờ: thứ (1 = CN ... 7 = T7) × giờ
    Order.aggregate([
      { $match: valid },
      { $group: { _id: { d: { $dayOfWeek: { date: '$createdAt', timezone: TZ } }, h: { $hour: { date: '$createdAt', timezone: TZ } } }, orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } }
    ]),
    // Phương thức thanh toán
    Order.aggregate([
      { $match: valid },
      { $group: { _id: '$paymentMode', orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } },
      { $sort: { revenue: -1 } }
    ]),
    // Danh mục: doanh thu từng dòng hàng (sau giảm giá của dòng)
    Order.aggregate([
      { $match: valid },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p', pipeline: [{ $project: { categoryId: 1 } }] } },
      { $group: { _id: { $first: '$p.categoryId' }, units: { $sum: '$items.quantity' }, revenue: { $sum: { $subtract: [{ $multiply: ['$items.unitPrice', '$items.quantity'] }, { $ifNull: ['$items.discountAmount', 0] }] } } } },
      { $sort: { revenue: -1 } }, { $limit: 8 },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { name: 1 } }] } },
      { $project: { _id: 0, name: { $ifNull: [{ $first: '$c.name' }, 'Khác'] }, units: 1, revenue: 1 } }
    ]),
    // Khách: theo tài khoản (khách lẻ không tài khoản gom chung userId = null)
    Order.aggregate([
      { $match: valid },
      { $group: { _id: '$userId', orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' }, name: { $last: '$deliveryAddress.fullName' } } }
    ]),
    // 15 đơn gần nhất (mọi trạng thái)
    Order.find(base).sort({ createdAt: -1 }).limit(15).select('orderCode createdAt grandTotal status paymentMode deliveryAddress.fullName items.quantity voucherCode').lean()
  ]);

  // ----- Khách mới / quay lại: "mới" = đơn đầu tiên ở TechShop (mọi kênh) nằm trong kỳ
  const members = customers.filter((c) => c._id);
  const guest = customers.find((c) => !c._id);
  const firsts = members.length
    ? await Order.aggregate([{ $match: { userId: { $in: members.map((c) => c._id) }, status: VALID } }, { $group: { _id: '$userId', first: { $min: '$createdAt' } } }])
    : [];
  const firstOf = new Map(firsts.map((f) => [String(f._id), f.first]));
  const newCount = members.filter((c) => firstOf.get(String(c._id)) >= from).length;
  const top = [...members].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const names = new Map((await mongoose.model('User').find({ _id: { $in: top.map((t) => t._id) } }).select('displayName phoneNumber').lean()).map((u) => [String(u._id), u]));

  // ----- Khung giờ: ma trận 7 × 24 + giờ / thứ bán đắt nhất
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
  const byDay = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, orders: 0, revenue: 0 }));
  for (const r of heat) {
    byHour[r._id.h].orders += r.orders; byHour[r._id.h].revenue += r.revenue;
    byDay[r._id.d - 1].orders += r.orders; byDay[r._id.d - 1].revenue += r.revenue;
  }
  const peakHour = byHour.reduce((a, b) => (b.revenue > a.revenue ? b : a), byHour[0]);
  const peakDay = byDay.reduce((a, b) => (b.revenue > a.revenue ? b : a), byDay[0]);

  const q = quality[0] || { total: 0, cancelled: 0, returned: 0, itemsTotal: 0, discount: 0, withVoucher: 0 };
  const validOrders = q.total - q.cancelled - q.returned;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    quality: {
      total: q.total, cancelled: q.cancelled, returned: q.returned,
      cancelRate: pct(q.cancelled + q.returned, q.total), // % đơn hủy / trả
      discount: q.discount, discountRate: pct(q.discount, q.itemsTotal), // % giảm giá trên tiền hàng
      voucherOrders: q.withVoucher, voucherRate: pct(q.withVoucher, validOrders) // % đơn dùng mã
    },
    heatmap: heat.map((r) => ({ day: r._id.d, hour: r._id.h, orders: r.orders, revenue: r.revenue })),
    byHour: byHour.filter((h) => h.hour >= 7 && h.hour <= 22), // giờ mở cửa
    byDay,
    peak: { hour: peakHour.revenue ? peakHour.hour : null, day: peakDay.revenue ? peakDay.day : null },
    payment: payment.map((p) => ({ mode: p._id, label: PAY_LABEL[p._id] || p._id, orders: p.orders, revenue: p.revenue })),
    category,
    customers: {
      members: members.length, // số khách có tài khoản
      newMembers: newCount, returning: members.length - newCount,
      guestOrders: guest?.orders || 0, guestRevenue: guest?.revenue || 0, // khách lẻ
      memberRevenue: members.reduce((s, c) => s + c.revenue, 0),
      top: top.map((t) => ({ _id: t._id, name: names.get(String(t._id))?.displayName || t.name || 'Khách', phone: names.get(String(t._id))?.phoneNumber || '', orders: t.orders, revenue: t.revenue }))
    },
    recent: recent.map((o) => ({ _id: o._id, orderCode: o.orderCode, createdAt: o.createdAt, grandTotal: o.grandTotal, status: o.status, payment: PAY_LABEL[o.paymentMode] || o.paymentMode, customer: o.deliveryAddress?.fullName || 'Khách lẻ', units: (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0), voucherCode: o.voucherCode || '' }))
  };
}

// Đọc nhân viên + kiểm tra quyền; trả về staff hoặc null (đã trả lỗi)
async function loadStaff(req, res, id, opts) {
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ message: 'Không tìm thấy nhân viên' }); return null; }
  const staff = await Admin.findOne({ _id: id, role: 'staff' }).select('name storeId').lean();
  if (!staff) { res.status(404).json({ message: 'Không tìm thấy nhân viên' }); return null; }
  if (!(await canViewStaff(req, staff, opts))) { res.status(403).json({ message: opts?.manage ? 'Chỉ quản lý của nhân viên này được đặt chỉ tiêu' : 'Bạn không quản lý nhân viên này' }); return null; }
  return staff;
}

async function respond(req, res, staffId) {
  const range = parseRange(req.query); // cùng cách hiểu khoảng thời gian với báo cáo nhân viên
  const sid = new mongoose.Types.ObjectId(String(staffId));
  const [target, data] = await Promise.all([targetProgress(sid), insights(sid, range)]);
  res.json({ data: { target, ...data, range: { from: range.from, to: range.to } } });
}

// @route GET /api/staff-reports/me/sales?from&to - nhân viên xem phân tích bán hàng của mình
const mySales = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'staff') return res.status(403).json({ message: 'Chỉ dành cho tài khoản nhân viên' });
  return respond(req, res, req.account._id);
});

// @route GET /api/staff-reports/staff/:id/sales?from&to - quản lý / admin xem của 1 nhân viên
const staffSales = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res, req.params.id);
  if (staff) return respond(req, res, staff._id);
  return undefined;
});

// @route PUT /api/staff-reports/staff/:id/target { month?, amount, orders? } - đặt chỉ tiêu tháng (admin / quản lý)
const setTarget = asyncHandler(async (req, res) => {
  const staff = await loadStaff(req, res, req.params.id, { manage: true }); // không tự đặt cho mình
  if (!staff) return undefined;
  const month = req.body.month === undefined ? vnMonth().key : String(req.body.month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ message: 'Tháng không hợp lệ (dạng YYYY-MM)' });
  if (month < vnMonth().key) return res.status(400).json({ message: 'Không đặt chỉ tiêu cho tháng đã qua' });
  const amount = Number(req.body.amount);
  const orders = Number(req.body.orders ?? 0);
  if (!Number.isInteger(amount) || amount < 0 || amount > 1e12) return res.status(400).json({ message: 'Doanh thu mục tiêu phải là số nguyên từ 0' });
  if (!Number.isInteger(orders) || orders < 0 || orders > 100000) return res.status(400).json({ message: 'Số đơn mục tiêu phải là số nguyên từ 0' });
  if (amount === 0) { // 0 = bỏ chỉ tiêu
    await SalesTarget.deleteOne({ staffId: staff._id, month });
    return res.json({ message: 'Đã bỏ chỉ tiêu', data: await targetProgress(staff._id) });
  }
  await SalesTarget.findOneAndUpdate(
    { staffId: staff._id, month },
    { $set: { amount, orders, setBy: req.account._id, setByName: req.account.name } },
    { upsert: true, new: true }
  );
  res.json({ message: `Đã đặt chỉ tiêu tháng ${month}`, data: await targetProgress(staff._id) });
});

module.exports = { mySales, staffSales, setTarget, vnMonth };
