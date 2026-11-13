const crypto = require('crypto');
const Order = require('../models/Order');
const Store = require('../models/Store');
const routing = require('../utils/deliveryRouting');
const { inScope } = require('./orderController');
const { historyEntry } = require('../utils/orderHistory');
const { BusinessError, transactionsSupported } = require('../utils/transaction');
const asyncHandler = require('../utils/asyncHandler');
const fail = (status, message) => { throw new BusinessError(status, message); };
const dispatch = asyncHandler(async (req, res) => {
  const order = await read(req);
  if (!['internal', 'ghn'].includes(req.body.method)) fail(400, 'Vui lòng chọn cách giao hàng');
  if (order.deliveryMethod !== 'home_delivery' || !['confirmed', 'processing'].includes(order.status) || order.activeTransferId || routing.activeShipment(order)) fail(409, 'Đơn chưa thể phân công hoặc đang có vận đơn hoạt động');
  const internal = req.body.method === 'internal';
  let shipper;
  if (internal) {
    shipper = (await require('./deliveryController').findShippers(order.storeId)).find(s => String(s._id) === req.body.shipperId);
    if (!shipper) fail(400, 'Chọn nhân viên giao hàng thuộc chi nhánh của đơn');
  } else {
    if (!(await transactionsSupported())) fail(503, 'Giao hàng cần MongoDB replica set');
    if (order.paymentMode !== 'cod' && order.paymentStatus !== 'paid') fail(400, 'Đơn thanh toán trước cần được thanh toán đủ');
  }
  const now = new Date();
  const code = 'GHN-DEMO-' + crypto.randomBytes(16).toString('hex').toUpperCase();
  const plan = { storeId: order.storeId, addressKey: routing.addressKey(order), mode: internal ? 'internal' : 'ghn', assignmentMode: 'manager_choice', provinceName: order.deliveryAddress?.city, verifiedBy: req.account._id, verifiedAt: now };
  const set = { deliveryPlan: plan, shipperId: shipper?._id || null, assignedAt: internal ? now : null, shipment: null };
  if (!internal) set.shipment = { provider: 'GHN', environment: 'simulation', phase: 'active', code, clientCode: code, status: 'ready_to_pick',
    codAmount: order.paymentStatus === 'paid' ? 0 : order.grandTotal, totalFee: order.shippingFee || 0,
    createdAt: now, updatedAt: now, expectedDeliveryTime: new Date(now.getTime() + 3 * 86400000), events: [{ status: 'ready_to_pick', at: now }] };
  const updated = await Order.findOneAndUpdate({ _id: order._id, __v: order.__v, status: order.status, paymentStatus: order.paymentStatus, shipperId: order.shipperId, activeTransferId: null, ...routing.shipmentGuard(order) }, {
    $set: set, $inc: { __v: 1 }, $push: { statusHistory: historyEntry(req, order.status, internal ? `Shop tự giao — phân công ${shipper.name}` : `Chọn GHN giả lập — tạo vận đơn ${code}`) }
  }, { new: true });
  if (!updated) fail(409, 'Đơn vừa thay đổi, hãy tải lại');
  res.json({ data: updated });
});
const NEXT = {
  ready_to_pick: ['picked'], picked: ['transporting'], transporting: ['delivering'],
  delivering: ['delivered', 'delivery_fail'], delivery_fail: ['delivering', 'returning'],
  returning: ['returned'], delivered: [], returned: [], cancel: []
};
async function read(req) {
  const order = await Order.findById(req.params.orderId);
  if (!order) fail(404, 'Không tìm thấy đơn');
  if (!inScope(req, order)) fail(403, 'Đơn thuộc chi nhánh khác');
  return order;
}
const prepare = asyncHandler(async (req, res) => {
  const order = await read(req);
  if (order.deliveryMethod !== 'home_delivery' || !['confirmed', 'processing'].includes(order.status) || order.activeTransferId || routing.activeShipment(order)) fail(409, 'Đơn chưa thể lập lại phương án giao hàng');
  if (req.body.addressVerified !== true) fail(400, 'Cần đối chiếu địa chỉ nhận với khách');
  const store = await Store.findById(order.storeId);
  const a = order.deliveryAddress;
  if (!store?.city || !a?.city || !a.addressLine1) fail(400, 'Cần địa chỉ và tỉnh/thành của chi nhánh và khách');
  const sameProvince = routing.provinceKey(store.city) === routing.provinceKey(a.city);
  const point = { lat: req.body.lat, lng: req.body.lng };
  const route = sameProvince ? await routing.roadDistance(store, point) : {};
  const internal = sameProvince && route.distanceMeters <= routing.LIMIT_METERS;
  if (req.body.express === true && !internal) fail(400, 'Hỏa tốc chỉ áp dụng cùng tỉnh và trong 20 km đường bộ');
  const plan = { storeId: store._id, addressKey: routing.addressKey(order), provinceName: a.city, wardName: a.state,
    sameProvince, ...(sameProvince ? point : {}), ...route, mode: internal ? (req.body.express ? 'express' : 'internal') : 'ghn', verifiedBy: req.account._id, verifiedAt: new Date() };
  const updated = await Order.findOneAndUpdate({ _id: order._id, __v: order.__v, status: order.status, activeTransferId: null, ...routing.shipmentGuard(order) }, {
    $set: { deliveryPlan: plan, shipperId: null, assignedAt: null }, $inc: { __v: 1 },
    $push: { statusHistory: historyEntry(req, order.status, `Phương án ${plan.mode === 'ghn' ? 'GHN giả lập' : plan.mode === 'express' ? 'hỏa tốc' : 'nội bộ'}: ${sameProvince ? (route.distanceMeters / 1000).toFixed(2) + ' km đường bộ' : 'khác tỉnh/thành'}`, undefined, store.name) }
  }, { new: true });
  if (!updated) fail(409, 'Đơn vừa thay đổi, hãy tải lại');
  res.json({ data: updated });
});
const create = asyncHandler(async (req, res) => {
  if (!(await transactionsSupported())) fail(503, 'Giao hàng cần MongoDB replica set');
  const order = await read(req);
  if (order.shipment?.phase === 'active') return res.json({ data: order });
  if (routing.activeShipment(order)) fail(409, 'Vận đơn sandbox cũ chưa rõ kết quả; cần kiểm tra trước khi tạo giả lập');
  if (order.deliveryMethod !== 'home_delivery' || order.status !== 'processing' || order.activeTransferId || !routing.currentPlan(order) || order.deliveryPlan.mode !== 'ghn') fail(409, 'Cần chuẩn bị hàng và xác minh phương án giao bên thứ ba trước');
  if (order.paymentMode !== 'cod' && order.paymentStatus !== 'paid') fail(400, 'Đơn không COD phải thanh toán trước');
  const parcel = {};
  for (const [key, max] of [['weight', 19999], ['length', 200], ['width', 200], ['height', 200]]) {
    const n = Number(req.body[key]);
    if (!Number.isInteger(n) || n < 1 || n > max) fail(400, 'Nhập khối lượng 1–19999 g và kích thước 1–200 cm');
    parcel[key] = n;
  }
  const now = new Date(), code = 'GHN-DEMO-' + crypto.randomBytes(16).toString('hex').toUpperCase();
  const shipment = { provider: 'GHN', environment: 'simulation', phase: 'active', code, clientCode: code,
    status: 'ready_to_pick', codAmount: order.paymentStatus === 'paid' ? 0 : order.grandTotal,
    totalFee: order.shippingFee || 0, request: { parcel }, createdAt: now, updatedAt: now,
    expectedDeliveryTime: new Date(now.getTime() + (order.deliveryPlan.sameProvince ? 2 : 3) * 86400000), events: [{ status: 'ready_to_pick', at: now }] };
  const updated = await Order.findOneAndUpdate({ _id: order._id, __v: order.__v, status: order.status, paymentStatus: order.paymentStatus, activeTransferId: null, ...routing.shipmentGuard(order) }, {
    $set: { shipment, shipperId: null, assignedAt: null }, $inc: { __v: 1 },
    $push: { statusHistory: historyEntry(req, order.status, `Tạo vận đơn GHN giả lập ${code}`) }
  }, { new: true });
  if (!updated) fail(409, 'Đơn vừa thay đổi hoặc đã tạo vận đơn, hãy tải lại');
  res.status(201).json({ data: updated });
});
const advance = asyncHandler(async (req, res) => {
  const order = await read(req);
  if (order.shipment?.environment !== 'simulation') fail(409, 'Chỉ cập nhật vận đơn giả lập');
  if (order.status === 'confirmed') fail(409, 'Chi nhánh cần chuẩn bị hàng và chuyển đơn sang Đang xử lý trước khi bàn giao');
  const status = req.body.status, previous = req.body.previousStatus;
  if (typeof status !== 'string' || typeof previous !== 'string' || !Object.prototype.hasOwnProperty.call(NEXT, status)) fail(400, 'Trạng thái giao hàng không hợp lệ');
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (note.length > 500) fail(400, 'Ghi chú tối đa 500 ký tự');
  if (['delivery_fail', 'returning'].includes(status) && !note) fail(400, 'Cần ghi lý do giao thất bại/chuyển hoàn');
  const updated = await require('./shipmentController').syncOrder(req, order, { status, previous, note, evidenceIds: req.body.evidenceIds });
  res.json({ data: updated });
});
const publicTracking = asyncHandler(async (req, res) => {
  const code = req.params.code;
  if (!/^GHN-DEMO-[A-F0-9]{32}$/.test(code)) fail(404, 'Không tìm thấy vận đơn giả lập');
  const order = await Order.findOne({ 'shipment.code': code, 'shipment.environment': 'simulation' }).select('shipment deliveryPlan.provinceName carrierPickupProof carrierDeliveryProof');
  if (!order) fail(404, 'Không tìm thấy vận đơn giả lập');
  res.set('Cache-Control', 'no-store');
  const s = order.shipment;
  // Allowlist only: no recipient, address, order id, money, operator or internal notes.
  res.json({ data: { code: s.code, status: s.status, environment: 'simulation', destination: order.deliveryPlan?.provinceName,
    expectedDeliveryTime: s.expectedDeliveryTime, updatedAt: s.updatedAt, events: s.events.map(e => ({ status: e.status, at: e.at })),
    photos: ['carrierPickupProof', 'carrierDeliveryProof'].flatMap(key => (order[key]?.evidenceIds || []).map(id => ({ stage: key === 'carrierPickupProof' ? 'picked' : 'delivered', at: order[key].at, url: `/deliveries/track/${code}/photos/${id}` }))) } });
});
const publicPhoto = asyncHandler(async (req, res) => {
  const { code, evidenceId } = req.params;
  if (!/^GHN-DEMO-[A-F0-9]{32}$/.test(code) || !require('mongoose').isValidObjectId(evidenceId)) fail(404, 'Không tìm thấy ảnh');
  const order = await Order.findOne({ 'shipment.code': code, 'shipment.environment': 'simulation' }).select('carrierPickupProof carrierDeliveryProof');
  const allowed = [...(order?.carrierPickupProof?.evidenceIds || []), ...(order?.carrierDeliveryProof?.evidenceIds || [])];
  if (!allowed.some(id => String(id) === evidenceId)) fail(404, 'Không tìm thấy ảnh');
  const doc = await require('../models/DeliveryEvidence').findOne({ _id: evidenceId, orderId: order._id, carrierCode: code, expiresAt: { $exists: false } }).select('+data');
  if (!doc) fail(404, 'Không tìm thấy ảnh');
  res.set({ 'Content-Type': doc.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.send(doc.data);
});
const retireSandbox = asyncHandler(async (req, res) => {
  const order = await read(req);
  if ((await require('../utils/shippingConfig').isGhnActive()) || order.shipment?.environment !== 'sandbox' || !['confirmed', 'processing'].includes(order.status) || !['creating', 'unknown', 'active', 'failed'].includes(order.shipment.phase)) fail(409, 'Chỉ ngừng vận đơn sandbox cũ chưa bàn giao');
  const updated = await Order.findOneAndUpdate({ _id: order._id, __v: order.__v, status: order.status, ...routing.shipmentGuard(order), $or: [{ 'shipment.busyUntil': null }, { 'shipment.busyUntil': { $lt: new Date() } }] }, {
    $set: { 'shipment.phase': 'cancelled', 'shipment.error': '', 'shipment.busyUntil': null }, $inc: { __v: 1 },
    $push: { statusHistory: historyEntry(req, order.status, `Ngừng theo dõi sandbox cũ ${order.shipment.code || order.shipment.clientCode || ''} để chuyển sang giả lập; không gửi lệnh hủy đến GHN`) }
  }, { new: true });
  if (!updated) fail(409, 'Vận đơn đang xử lý, hãy tải lại');
  res.json({ data: updated });
});
module.exports = { prepare, create, advance, publicTracking, publicPhoto, retireSandbox, dispatch, NEXT };
