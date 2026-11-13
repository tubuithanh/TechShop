const { assignmentEntry } = require('../utils/assignmentLog');
const { isGhnActive, ghnSettings } = require('../utils/shippingConfig');
const crypto = require('crypto');
const Order = require('../models/Order');
const Store = require('../models/Store');
const ghn = require('../utils/ghn');
const routing = require('../utils/deliveryRouting');
const { inScope, transitionOrder } = require('./orderController');
const { hasPermission } = require('../middlewares/authMiddleware');
const { BusinessError, transactionsSupported } = require('../utils/transaction');
const { historyEntry } = require('../utils/orderHistory');
const asyncHandler = require('../utils/asyncHandler');
const fail = (status, message) => { throw new BusinessError(status, message); };
const read = async req => {
  const order = await Order.findById(req.params.orderId).select('+shipment.request');
  if (!order) fail(404, 'Không tìm thấy đơn');
  if (!inScope(req, order)) fail(403, 'Đơn thuộc chi nhánh khác');
  return order;
};
const publicOrder = order => { const o = order.toObject ? order.toObject() : order; if (o.shipment) { delete o.shipment.request; delete o.shipment.lease; } return o; };
const canPrepare = order => {
  if (order.deliveryMethod !== 'home_delivery' || !['confirmed', 'processing'].includes(order.status) || order.activeTransferId || routing.activeShipment(order)) fail(409, 'Chỉ lập phương án cho đơn chưa giao, không chờ điều phối và chưa có vận đơn hoạt động');
};
const locations = asyncHandler(async (req, res) => res.json({ data: await ghn.locations(req.params.kind, req.query.parent) }));
const prepare = asyncHandler(async (req, res) => {
  const order = await read(req); canPrepare(order);
  if (req.body.addressVerified !== true) fail(400, 'Cần đối chiếu địa chỉ và vị trí nhận hàng với khách');
  const store = await Store.findById(order.storeId).lean();
  const provinces = await ghn.locations('provinces');
  const matches = (p, name) => [p.ProvinceName, ...(p.NameExtension || [])].some(n => routing.provinceKey(n) === routing.provinceKey(name));
  const from = provinces.find(p => matches(p, store.city));
  const to = provinces.find(p => p.ProvinceID === Number(req.body.provinceId));
  if (!from || !to || !matches(to, order.deliveryAddress?.city)) fail(400, 'Tỉnh/thành đã chọn phải khớp địa chỉ đơn hàng và chi nhánh');
  const district = (await ghn.locations('districts', to.ProvinceID)).find(d => d.DistrictID === Number(req.body.districtId));
  const ward = district && (await ghn.locations('wards', district.DistrictID)).find(w => w.WardCode === String(req.body.wardCode));
  if (!district || !ward) fail(400, 'Phường/xã không thuộc địa chỉ đã chọn');
  const sameProvince = from.ProvinceID === to.ProvinceID;
  const point = { lat: req.body.lat, lng: req.body.lng };
  const route = sameProvince ? await routing.roadDistance(store, point) : {};
  const internal = sameProvince && route.distanceMeters <= routing.LIMIT_METERS;
  if (req.body.express === true && !internal) fail(400, 'Hỏa tốc chỉ áp dụng cùng tỉnh và trong 20 km đường bộ');
  const plan = { storeId: store._id, addressKey: routing.addressKey(order), provinceId: to.ProvinceID, districtId: district.DistrictID, wardCode: ward.WardCode,
    provinceName: to.ProvinceName, districtName: district.DistrictName, wardName: ward.WardName,
    sameProvince, ...(sameProvince ? point : {}), ...route, mode: internal ? (req.body.express === true ? 'express' : 'internal') : 'ghn', verifiedBy: req.account._id, verifiedAt: new Date() };
  const updated = await Order.findOneAndUpdate({ _id: order._id, storeId: order.storeId, status: order.status, activeTransferId: null, __v: order.__v, ...routing.shipmentGuard(order) }, {
    $set: { deliveryPlan: plan, shipperId: null, assignedAt: null }, $inc: { __v: 1 },
    $push: { statusHistory: historyEntry(req, order.status, `Phương án giao: ${plan.mode === 'ghn' ? 'GHN sandbox' : plan.mode === 'express' ? 'Hỏa tốc' : 'Nhân viên nội bộ'}; ${sameProvince ? (route.distanceMeters / 1000).toFixed(2) + ' km đường bộ' : 'khác tỉnh/thành'}`, undefined, store.name) }
  }, { new: true });
  if (!updated) fail(409, 'Đơn vừa thay đổi, hãy tải lại');
  res.json({ data: publicOrder(updated) });
});

function parcel(body) {
  const result = {};
  for (const [key, max] of [['weight', 19999], ['length', 200], ['width', 200], ['height', 200]]) {
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 1 || n > max) fail(400, 'Nhập kiện dưới 20 kg, kích thước nguyên từ 1 đến 200 cm');
    result[key] = n;
  }
  return result;
}
const create = asyncHandler(async (req, res) => {
  if (!(await transactionsSupported())) fail(503, 'Giao hàng GHN cần MongoDB replica set');
  let order = await read(req);
  if (order.shipment?.phase === 'active') return res.json({ data: publicOrder(order) });
  const retry = ['creating', 'unknown'].includes(order.shipment?.phase);
  let payload, shopId, clientCode;
  if (retry) {
    payload = order.shipment.request; shopId = order.shipment.shopId; clientCode = order.shipment.clientCode;
    if (!payload) fail(409, 'Thiếu bản chụp yêu cầu GHN, cần kiểm tra vận đơn trước khi tiếp tục');
  } else {
    canPrepare(order);
    if (order.status !== 'processing' || !routing.currentPlan(order) || order.deliveryPlan.mode !== 'ghn') fail(409, 'Cần chuẩn bị hàng và xác minh phương án GHN trước');
    if (order.paymentMode !== 'cod' && order.paymentStatus !== 'paid') fail(400, 'Đơn không COD phải thanh toán trước khi tạo vận đơn');
    const dimensions = parcel(req.body);
    const codAmount = order.paymentStatus === 'paid' ? 0 : order.grandTotal;
    if (codAmount > 50000000) fail(400, 'COD GHN tối đa 50 triệu đồng');
    const shop = await ghn.shopFor(order.storeId);
    shopId = shop._id; clientCode = `TS-${crypto.randomUUID()}`;
    const p = order.deliveryPlan, a = order.deliveryAddress;
    payload = { client_order_code: clientCode, payment_type_id: 1, required_note: 'CHOXEMHANGKHONGTHU',
      to_name: a.fullName, to_phone: a.phone, to_address: [a.addressLine1, a.addressLine2, p.wardName, p.districtName, p.provinceName].filter(Boolean).join(', '),
      to_province_name: p.provinceName, to_district_name: p.districtName, to_ward_name: p.wardName,
      to_district_id: p.districtId, to_ward_code: p.wardCode,
      cod_amount: codAmount, service_type_id: 2, ...dimensions,
      content: order.items.map(i => `${i.name} x${i.quantity}`).join(', ').slice(0, 2000),
      note: String(order.note || '').slice(0, 1000) };
  }
  const lease = crypto.randomUUID();
  const filter = { _id: order._id, storeId: order.storeId, status: order.status, paymentStatus: order.paymentStatus, activeTransferId: null, __v: order.__v, ...routing.shipmentGuard(order),
    $or: [{ 'shipment.busyUntil': null }, { 'shipment.busyUntil': { $lt: new Date() } }] };
  const updated = await Order.findOneAndUpdate(filter, {
    $set: { shipment: { provider: 'GHN', environment: 'sandbox', shopId, clientCode, phase: 'creating', request: payload, codAmount: payload.cod_amount, busyUntil: new Date(Date.now() + 60000), lease, createdAt: order.shipment?.createdAt || new Date() }, shipperId: null, assignedAt: null }, $inc: { __v: 1 }
  }, { new: true });
  if (!updated) fail(409, 'Yêu cầu đang được xử lý hoặc đơn vừa thay đổi; hãy chờ rồi tải lại');
  try {
    // A retry always uses the same immutable client_order_code and payload (GHN deduplicates it).
    const result = await ghn.create(shopId, payload);
    if (!result?.order_code) throw new BusinessError(502, 'GHN chưa trả mã vận đơn; hãy thử lại cùng yêu cầu');
    const saved = await Order.findOneAndUpdate({ _id: order._id, 'shipment.clientCode': clientCode, 'shipment.lease': lease }, {
      $set: { 'shipment.phase': 'active', 'shipment.code': result.order_code, 'shipment.status': 'ready_to_pick', 'shipment.totalFee': result.total_fee,
        'shipment.expectedDeliveryTime': result.expected_delivery_time, 'shipment.updatedAt': new Date(), 'shipment.busyUntil': null, 'shipment.error': '' },
      $push: { 'shipment.events': { status: 'ready_to_pick', at: new Date() }, statusHistory: historyEntry(req, order.status, `Tạo vận đơn GHN sandbox ${result.order_code}`) }
    }, { new: true });
    if (!saved) fail(409, 'Cần đồng bộ lại kết quả GHN');
    res.status(201).json({ data: publicOrder(saved) });
  } catch (err) {
    await Order.updateOne({ _id: order._id, 'shipment.clientCode': clientCode, 'shipment.lease': lease, 'shipment.phase': 'creating' }, {
      $set: { 'shipment.phase': err.definite && !retry ? 'failed' : 'unknown', 'shipment.busyUntil': null, 'shipment.error': err.message }
    });
    throw err;
  }
});

const PICKED = new Set(['picked', 'storing', 'transporting', 'sorting', 'delivering', 'delivery_fail', 'waiting_to_return', 'return', 'return_transporting', 'return_sorting', 'returning', 'return_fail', 'returned', 'delivered']);
const RETURNING = new Set(['waiting_to_return', 'return', 'return_transporting', 'return_sorting', 'returning', 'return_fail', 'returned']);
async function lock(order) {
  const lease = crypto.randomUUID();
  const result = await Order.updateOne({ _id: order._id, 'shipment.code': order.shipment.code, 'shipment.phase': 'active', $or: [{ 'shipment.busyUntil': null }, { 'shipment.busyUntil': { $lt: new Date() } }] }, {
    $set: { 'shipment.lease': lease, 'shipment.busyUntil': new Date(Date.now() + 60000) }
  });
  if (!result.modifiedCount) fail(409, 'Vận đơn đang đồng bộ, vui lòng thử lại');
  return lease;
}
async function syncOrder(req, initial, simulationUpdate) {
  if (!initial.shipment?.code || initial.shipment.phase !== 'active') return initial;
  const simulated = initial.shipment.environment === 'simulation';
  if (!simulationUpdate && (simulated || !(await isGhnActive()))) return initial;
  if (!(await transactionsSupported())) fail(503, 'Đồng bộ giao hàng cần MongoDB replica set');
  const lease = await lock(initial);
  try {
    const data = simulated ? { order_code: initial.shipment.code, status: simulationUpdate.status } : await ghn.detail(initial.shipment.shopId, initial.shipment.code);
    if (data.order_code !== initial.shipment.code || typeof data.status !== 'string') fail(502, 'Kết quả GHN không khớp vận đơn');
    let order = await Order.findById(initial._id);
    if (order.shipment.lease !== lease) fail(409, 'Lượt đồng bộ đã hết hạn, hãy thử lại');
    if (simulated) {
      const next = require('./simulatedShipmentController').NEXT[order.shipment.status] || [];
      if (simulationUpdate.previous !== order.shipment.status || !next.includes(data.status)) fail(409, 'Trạng thái đã thay đổi hoặc bước giao hàng không hợp lệ. Hãy tải lại.');
      if (['picked', 'delivered'].includes(data.status)) {
        const ids = simulationUpdate.evidenceIds;
        const mongoose = require('mongoose');
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id))) fail(400, 'Cần đính kèm từ 1 đến 5 ảnh bằng chứng');
        const count = await require('../models/DeliveryEvidence').countDocuments({ _id: { $in: ids }, orderId: order._id, uploadedBy: req.account._id, carrierCode: order.shipment.code, carrierStage: data.status, expiresAt: { $gt: new Date() } });
        if (count !== ids.length) fail(400, 'Ảnh không thuộc đơn, vận đơn hoặc bước giao hàng này; hãy tải lại');
      }
    }
    const carrierReq = simulated ? req : Object.assign(Object.create(req), { account: { name: 'GHN sandbox' }, accountRole: 'system' });
    const change = async (status, action) => {
      const extraSet = status === 'delivered' && order.paymentMode === 'cod' ? { receipt: { amount: order.shipment.codAmount, at: new Date(), channel: 'ghn' } } : {};
      if (simulated && ['shipping', 'delivered'].includes(status)) extraSet[status === 'shipping' ? 'carrierPickupProof' : 'carrierDeliveryProof'] = { evidenceIds: simulationUpdate.evidenceIds, at: new Date(), by: req.account._id };
      if (simulated) Object.assign(extraSet, { 'shipment.status': data.status, 'shipment.updatedAt': new Date() });
      const result = await transitionOrder(carrierReq, order, status, { action, note: `GHN ${data.order_code}: ${data.status}${simulationUpdate?.note ? ' — ' + simulationUpdate.note : ''}`, extraSet, ...(simulated ? { extraPush: { 'shipment.events': { status: data.status, at: new Date() } } } : {}) });
      if (result.error) fail(result.error.status, result.error.message);
      order = result.updated;
    };
    if (PICKED.has(data.status) && order.status === 'processing') await change('shipping', 'carrierPickup');
    if (data.status === 'delivered' && order.status === 'shipping') await change('delivered', 'carrierSuccess');
    if (RETURNING.has(data.status) && ['shipping', 'delivered'].includes(order.status)) await change('returning', 'carrierReturn');
    // GHN returning/returned NEVER restocks by itself; warehouse still has to receive the parcel.
    const cancelled = data.status === 'cancel' && ['confirmed', 'processing'].includes(order.status);
    const same = order.shipment.status === data.status;
    return await Order.findOneAndUpdate({ _id: order._id, 'shipment.lease': lease }, {
      $set: { 'shipment.status': data.status, 'shipment.phase': cancelled ? 'cancelled' : 'active', 'shipment.updatedAt': new Date(), 'shipment.error': '' },
      ...(!same ? { $push: { 'shipment.events': { status: data.status, at: new Date() }, statusHistory: historyEntry(carrierReq, order.status, `GHN${simulated ? ' giả lập' : ''}: ${data.status}${simulationUpdate?.note ? ' — ' + simulationUpdate.note : ''}`) } } : {})
    }, { new: true });
  } finally { await Order.updateOne({ _id: initial._id, 'shipment.lease': lease }, { $set: { 'shipment.busyUntil': null } }); }
}
const sync = asyncHandler(async (req, res) => res.json({ data: publicOrder(await syncOrder(req, await read(req))) }));
const cancel = asyncHandler(async (req, res) => {
  const order = await read(req);
  if (!order.shipment?.code || order.shipment.phase !== 'active' || !['confirmed', 'processing'].includes(order.status)) fail(409, 'Chỉ hủy vận đơn trước khi bàn giao GHN');
  const lease = await lock(order);
  try {
    const fresh = await Order.findById(order._id);
    if (!['confirmed', 'processing'].includes(fresh.status) || fresh.shipment.status !== 'ready_to_pick') fail(409, 'Vận đơn đã được bàn giao, không thể hủy');
    if (order.shipment.environment !== 'simulation' && !(await isGhnActive())) fail(409, 'Đây là vận đơn sandbox cũ; chưa thể hủy bằng chế độ giả lập');
    const result = order.shipment.environment === 'simulation' ? [{ order_code: order.shipment.code, result: true }] : await ghn.cancel(order.shipment.shopId, order.shipment.code);
    if (!result?.some(r => r.order_code === order.shipment.code && r.result === true)) fail(409, 'GHN chưa xác nhận hủy. Hãy đồng bộ trạng thái.');
    const updated = await Order.findOneAndUpdate({ _id: order._id, 'shipment.lease': lease }, {
      $set: { 'shipment.phase': 'cancelled', 'shipment.status': 'cancel', 'shipment.updatedAt': new Date() },
      $push: { 'shipment.events': { status: 'cancel', at: new Date() }, statusHistory: historyEntry(req, order.status, `Đã hủy vận đơn ${order.shipment.code}; đơn bán hàng và tồn kho giữ nguyên`),
        assignmentLog: assignmentEntry(req, { action: 'carrier_cancel', method: order.shipment.environment === 'simulation' ? 'simulation' : 'ghn_sandbox', carrierCode: order.shipment.code }) }
    }, { new: true });
    res.json({ data: publicOrder(updated) });
  } finally { await Order.updateOne({ _id: order._id, 'shipment.lease': lease }, { $set: { 'shipment.busyUntil': null } }); }
});
const tracking = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) fail(404, 'Không tìm thấy đơn');
  const owner = req.accountRole === 'customer' && String(order.userId) === String(req.account._id);
  if (!owner && (!(hasPermission(req, 'orders.manage') || hasPermission(req, 'deliveries.manage')) || !inScope(req, order))) fail(403, 'Không có quyền xem vận đơn');
  const current = req.query.refresh === 'true' ? await syncOrder(req, order) : order;
  res.json({ data: { orderCode: current.orderCode, deliveryPlan: current.deliveryPlan, shipment: publicOrder(current).shipment } });
});
const settle = asyncHandler(async (req, res) => {
  const order = await read(req);
  const reference = typeof req.body.reference === 'string' ? req.body.reference.trim() : '';
  if (!reference || reference.length > 200) fail(400, 'Nhập mã đối soát (tối đa 200 ký tự)');
  const updated = await Order.findOneAndUpdate({ _id: order._id, storeId: order.storeId, status: 'delivered', 'shipment.phase': 'active', 'shipment.codAmount': { $gt: 0 }, 'shipment.codSettledAt': null }, {
    $set: { 'shipment.codSettledAt': new Date(), 'shipment.codSettlementReference': reference },
    $push: { statusHistory: historyEntry(req, order.status, `Đối soát COD GHN ${order.shipment?.environment === 'simulation' ? 'giả lập' : 'sandbox'}: ${reference}`) }
  }, { new: true });
  if (!updated) fail(409, 'Không có COD GHN chờ đối soát');
  res.json({ data: publicOrder(updated) });
});
let polling = false;
async function pollShipments(app) {
  if (polling || !(await isGhnActive()) || !(await ghnSettings()).token) return;
  polling = true;
  try {
    const orders = await Order.find({ 'shipment.environment': 'sandbox', 'shipment.phase': 'active', 'shipment.status': { $nin: ['delivered', 'returned', 'cancel'] },
      $or: [{ 'shipment.updatedAt': null }, { 'shipment.updatedAt': { $lt: new Date(Date.now() - 60000) } }] }).sort({ 'shipment.updatedAt': 1 }).limit(20);
    for (const order of orders) {
      try { await syncOrder({ app, account: { name: 'GHN sandbox' }, accountRole: 'system' }, order); }
      catch (err) { if (err.status !== 409) console.warn(`[GHN] Chưa đồng bộ được đơn ${order.orderCode}: ${err.message}`); }
    }
  } finally { polling = false; }
}
module.exports = { locations, prepare, create, sync, cancel, tracking, settle, syncOrder, pollShipments };
