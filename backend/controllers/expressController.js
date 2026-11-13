// Giao hỏa tốc: quản lý mở khung giờ + chọn sản phẩm; khách kiểm tra & đặt; theo dõi đơn hỏa tốc đang chạy.
const mongoose = require('mongoose');
const ExpressWindow = require('../models/ExpressWindow');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const asyncHandler = require('../utils/asyncHandler');
const { isStoreAllowed, getScopedStoreId } = require('../middlewares/authMiddleware');
const { checkExpress, openFilter } = require('../utils/express');

const isId = (v) => mongoose.isValidObjectId(String(v ?? ''));

// @route GET /api/express/active - (công khai) sản phẩm đang được giao hỏa tốc: trang sản phẩm hiện nhãn "⚡ Giao 2 giờ"
const active = asyncHandler(async (req, res) => {
  const windows = await ExpressWindow.find(openFilter()).populate('storeId', 'name city').lean();
  res.json({
    data: windows.map((w) => ({
      _id: w._id, title: w.title, store: w.storeId ? { _id: w.storeId._id, name: w.storeId.name, city: w.storeId.city } : null,
      radiusKm: w.radiusKm, fee: w.fee, slaMinutes: w.slaMinutes, endAt: w.endAt, productIds: w.productIds,
      slotsLeft: w.maxOrders ? w.maxOrders - w.ordersCount : null
    }))
  });
});

// @route POST /api/express/check { lat, lng } - (khách) giỏ hàng hiện tại có giao hỏa tốc tới vị trí này được không
const check = asyncHandler(async (req, res) => {
  if (req.accountRole !== 'customer') return res.status(403).json({ message: 'Chỉ dành cho khách hàng' });
  const cart = await Cart.findOne({ userId: req.account._id }).lean();
  const items = (cart?.items || []).map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }));
  const r = await checkExpress({ items, point: { lat: req.body.lat, lng: req.body.lng } });
  if (!r.ok) return res.json({ data: { ok: false, reason: r.reason } });
  res.json({
    data: {
      ok: true, windowId: r.window._id, title: r.window.title, fee: r.window.fee, slaMinutes: r.window.slaMinutes,
      store: { _id: r.store._id, name: r.store.name, address: r.store.address },
      distanceKm: Math.round(r.distanceMeters / 100) / 10, etaMinutes: Math.round(r.durationSeconds / 60), deadline: r.deadline, endAt: r.window.endAt
    }
  });
});

// ---------- QUẢN LÝ ----------
function parseWindow(body, partial) {
  const out = {};
  const date = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
  if (body.startAt !== undefined || !partial) { out.startAt = date(body.startAt); if (!out.startAt) return { error: 'Giờ bắt đầu không hợp lệ' }; }
  if (body.endAt !== undefined || !partial) { out.endAt = date(body.endAt); if (!out.endAt) return { error: 'Giờ kết thúc không hợp lệ' }; }
  if (out.startAt && out.endAt && out.endAt <= out.startAt) return { error: 'Giờ kết thúc phải sau giờ bắt đầu' };
  if (out.endAt && out.startAt && out.endAt - out.startAt > 24 * 3600000) return { error: 'Một khung giờ hỏa tốc tối đa 24 giờ' };
  const num = (k, min, max) => {
    if (body[k] === undefined) return null;
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < min || n > max) return `Giá trị ${k} phải từ ${min} đến ${max}`;
    out[k] = n; return null;
  };
  const err = num('radiusKm', 1, 20) || num('fee', 0, 500000) || num('slaMinutes', 30, 240) || num('maxOrders', 0, 1000);
  if (err) return { error: err.replace('radiusKm', 'bán kính (km)').replace('fee', 'phí hỏa tốc').replace('slaMinutes', 'thời gian giao (phút)').replace('maxOrders', 'số đơn tối đa') };
  if (body.title !== undefined) out.title = String(body.title).trim().slice(0, 120) || 'Giao hỏa tốc 2 giờ';
  if (body.note !== undefined) out.note = String(body.note).trim().slice(0, 300);
  if (body.isActive !== undefined) out.isActive = body.isActive === true;
  if (body.productIds !== undefined || !partial) {
    if (!Array.isArray(body.productIds) || !body.productIds.length || body.productIds.length > 500 || body.productIds.some((x) => !isId(x))) return { error: 'Chọn ít nhất 1 sản phẩm giao hỏa tốc' };
    out.productIds = [...new Set(body.productIds.map(String))];
  }
  return { value: out };
}

// @route GET /api/express/admin?storeId=&status=open|upcoming|ended
const adminList = asyncHandler(async (req, res) => {
  const scoped = getScopedStoreId(req);
  const filter = {};
  if (scoped) filter.storeId = scoped;
  else if (isId(req.query.storeId)) filter.storeId = req.query.storeId;
  const now = new Date();
  if (req.query.status === 'open') Object.assign(filter, { isActive: true, startAt: { $lte: now }, endAt: { $gt: now } });
  if (req.query.status === 'upcoming') Object.assign(filter, { isActive: true, startAt: { $gt: now } });
  if (req.query.status === 'ended') filter.$or = [{ endAt: { $lte: now } }, { isActive: false }];
  const windows = await ExpressWindow.find(filter).sort({ startAt: -1 }).limit(100).populate('storeId', 'name').populate('productIds', 'title featuredImage').lean();
  // Đơn hỏa tốc của từng khung: đã giao / đang chạy / trễ hạn
  const stats = await Order.aggregate([
    { $match: { 'express.windowId': { $in: windows.map((w) => w._id) } } },
    { $group: { _id: '$express.windowId', orders: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
      late: { $sum: { $cond: [{ $or: [{ $gt: ['$express.deliveredAt', '$express.deadline'] }, { $and: [{ $ne: ['$status', 'delivered'] }, { $ne: ['$status', 'cancelled'] }, { $lt: ['$express.deadline', now] }] }] }, 1, 0] } },
      revenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } } } }
  ]);
  const byId = new Map(stats.map((s) => [String(s._id), s]));
  res.json({ data: windows.map((w) => ({ ...w, stats: byId.get(String(w._id)) || { orders: 0, delivered: 0, late: 0, revenue: 0 } })) });
});

// @route POST /api/express/admin
const create = asyncHandler(async (req, res) => {
  const storeId = getScopedStoreId(req) || req.body.storeId;
  if (!isId(storeId) || !isStoreAllowed(req, storeId)) return res.status(403).json({ message: 'Bạn không quản lý chi nhánh này' });
  const store = await Store.findOne({ _id: storeId, isActive: { $ne: false } }).select('lat lng name').lean();
  if (!store) return res.status(404).json({ message: 'Không tìm thấy chi nhánh' });
  if (!Number.isFinite(store.lat) || !Number.isFinite(store.lng)) return res.status(400).json({ message: `Chi nhánh ${store.name} chưa có tọa độ - cập nhật trong Quản lý chi nhánh trước` });
  const parsed = parseWindow(req.body, false);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  if (await Product.countDocuments({ _id: { $in: parsed.value.productIds } }) !== parsed.value.productIds.length) return res.status(400).json({ message: 'Có sản phẩm không tồn tại' });
  const w = await ExpressWindow.create({ ...parsed.value, storeId, createdBy: req.account._id, createdByName: req.account.name });
  res.status(201).json({ data: w });
});

// @route PUT /api/express/admin/:id - sửa / tắt sớm (isActive=false)
const update = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy khung giờ' });
  const w = await ExpressWindow.findById(req.params.id);
  if (!w) return res.status(404).json({ message: 'Không tìm thấy khung giờ' });
  if (!isStoreAllowed(req, w.storeId)) return res.status(403).json({ message: 'Bạn không quản lý chi nhánh này' });
  const parsed = parseWindow(req.body, true);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  Object.assign(w, parsed.value);
  if (w.endAt <= w.startAt) return res.status(400).json({ message: 'Giờ kết thúc phải sau giờ bắt đầu' });
  await w.save();
  res.json({ data: w });
});

module.exports = { active, check, adminList, create, update };
