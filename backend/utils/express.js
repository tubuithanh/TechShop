// Giao hỏa tốc 2 giờ: tìm khung giờ đang mở phù hợp với giỏ hàng + vị trí khách, phân công shipper ngay.
const mongoose = require('mongoose');
const ExpressWindow = require('../models/ExpressWindow');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');

const openFilter = (now = new Date()) => ({ isActive: true, startAt: { $lte: now }, endAt: { $gt: now }, $or: [{ maxOrders: 0 }, { $expr: { $lt: ['$ordersCount', '$maxOrders'] } }] });

// Khoảng cách theo đường chim bay (m)
function haversine(a, b) {
  const R = 6371000; const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Khoảng cách đường bộ (OSRM); không gọi được dịch vụ bản đồ thì ước lượng = chim bay x 1,35 (đường đô thị)
async function distanceTo(store, point) {
  try {
    const r = await require('./deliveryRouting').roadDistance(store, point);
    return { meters: r.distanceMeters, seconds: r.durationSeconds, provider: 'OSRM' };
  } catch {
    const m = haversine(store, point) * 1.35;
    return { meters: m, seconds: (m / 1000 / 25) * 3600, provider: 'ước lượng' };
  }
}

const validPoint = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

// items: [{ productId, variantId, quantity }]. Trả về { ok, window, store, distanceMeters, deadline } hoặc { ok:false, reason }
// windowId: kiểm tra đúng 1 khung (lúc đặt hàng); không có thì chọn khung gần nhất phù hợp (lúc khách kiểm tra)
async function checkExpress({ items, point, windowId }) {
  if (!Array.isArray(items) || !items.length) return { ok: false, reason: 'Giỏ hàng đang trống' };
  if (!validPoint(point)) return { ok: false, reason: 'Cần vị trí giao hàng để kiểm tra giao hỏa tốc' };
  const p = { lat: Number(point.lat), lng: Number(point.lng) };
  const filter = openFilter();
  if (windowId) { if (!mongoose.isValidObjectId(windowId)) return { ok: false, reason: 'Khung giờ hỏa tốc không hợp lệ' }; filter._id = windowId; }
  const windows = await ExpressWindow.find(filter).lean();
  if (!windows.length) return { ok: false, reason: windowId ? 'Khung giờ hỏa tốc đã kết thúc hoặc hết suất' : 'Hiện chưa có khung giờ giao hỏa tốc' };
  const productIds = [...new Set(items.map((i) => String(i.productId)))];
  const candidates = windows.filter((w) => productIds.every((id) => w.productIds.some((x) => String(x) === id)));
  if (!candidates.length) return { ok: false, reason: 'Có sản phẩm trong giỏ không thuộc danh sách giao hỏa tốc' };
  const stores = await Store.find({ _id: { $in: candidates.map((w) => w.storeId) }, isActive: { $ne: false } }).select('name address city lat lng').lean();
  const storeMap = new Map(stores.map((s) => [String(s._id), s]));
  let best = null; let lastReason = 'Địa chỉ nằm ngoài phạm vi giao hỏa tốc';
  for (const w of candidates) {
    const store = storeMap.get(String(w.storeId));
    if (!store || !validPoint(store)) continue;
    // Còn đủ hàng tại chi nhánh
    const stock = await StoreInventory.find({ storeId: store._id, variantId: { $in: items.map((i) => i.variantId) } }).select('variantId stock').lean();
    const enough = items.every((i) => (stock.find((s) => String(s.variantId) === String(i.variantId))?.stock || 0) >= i.quantity);
    if (!enough) { lastReason = `Chi nhánh ${store.name} không còn đủ hàng để giao hỏa tốc`; continue; }
    if (haversine(store, p) > w.radiusKm * 1000) continue; // loại nhanh trước khi gọi bản đồ
    const d = await distanceTo(store, p);
    if (d.meters > w.radiusKm * 1000) { lastReason = `Địa chỉ cách ${store.name} ${(d.meters / 1000).toFixed(1)} km - ngoài bán kính ${w.radiusKm} km`; continue; }
    if (!best || d.meters < best.distanceMeters) best = { window: w, store, distanceMeters: Math.round(d.meters), durationSeconds: Math.round(d.seconds), provider: d.provider };
  }
  if (!best) return { ok: false, reason: lastReason };
  return { ok: true, ...best, deadline: new Date(Date.now() + best.window.slaMinutes * 60000) };
}

// Chọn shipper rảnh nhất của chi nhánh (ít đơn đang giữ nhất)
async function pickShipper(storeId) {
  const { findShippers } = require('../controllers/deliveryController');
  const shippers = await findShippers(storeId);
  if (!shippers.length) return null;
  const load = await Order.aggregate([
    { $match: { shipperId: { $in: shippers.map((s) => s._id) }, status: { $in: ['confirmed', 'processing', 'shipping'] } } },
    { $group: { _id: '$shipperId', n: { $sum: 1 } } }
  ]);
  const busy = new Map(load.map((l) => [String(l._id), l.n]));
  return shippers.sort((a, b) => (busy.get(String(a._id)) || 0) - (busy.get(String(b._id)) || 0))[0];
}

module.exports = { checkExpress, pickShipper, openFilter, haversine };
