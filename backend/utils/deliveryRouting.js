const crypto = require('crypto');
const { httpJson } = require('./httpJson');
const { BusinessError } = require('./transaction');
const { normalizeSearch } = require('./search');
const LIMIT_METERS = 20000;
function provinceKey(name) { return normalizeSearch(name).replace(/^(tinh|thanh pho|tp\.?)[\s.]*/g, '').replace(/[^a-z0-9]/g, ''); }
function addressKey(order) {
  const a = order.deliveryAddress || {};
  return crypto.createHash('sha256').update(JSON.stringify([String(order.storeId?._id || order.storeId), a.addressLine1, a.addressLine2, a.city, a.state])).digest('hex');
}
function activeShipment(order) { return ['creating', 'unknown', 'active'].includes(order.shipment?.phase); }
function shipmentGuard(order) {
  return { 'shipment.phase': order.shipment?.phase || null, 'shipment.clientCode': order.shipment?.clientCode || null };
}
function currentPlan(order) {
  return order.deliveryPlan?.addressKey === addressKey(order) && String(order.deliveryPlan.storeId) === String(order.storeId?._id || order.storeId);
}
function internalAllowed(order) {
  if (currentPlan(order) && order.deliveryPlan.mode === 'internal' && order.deliveryPlan.assignmentMode === 'manager_choice') return true;
  return currentPlan(order) && ['internal', 'express'].includes(order.deliveryPlan.mode) && order.deliveryPlan.sameProvince === true
    && Number.isFinite(order.deliveryPlan.distanceMeters) && order.deliveryPlan.distanceMeters >= 0 && order.deliveryPlan.distanceMeters <= LIMIT_METERS;
}
async function roadDistance(from, to) {
  for (const p of [from, to]) if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) throw new BusinessError(400, 'Cần tọa độ hợp lệ của chi nhánh và nơi nhận hàng');
  const base = (await require('./shippingConfig').getShippingConfig()).routingApiUrl;
  const url = new URL(`/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&radiuses=200;200`, base);
  let result;
  try { result = await httpJson(url); } catch { throw new BusinessError(503, 'Chưa tính được tuyến đường. Vui lòng thử lại; không tự suy đoán khoảng cách.'); }
  const route = result.data.routes?.[0];
  if (result.status !== 200 || result.data.code !== 'Ok' || !Number.isFinite(route?.distance) || route.distance < 0) throw new BusinessError(400, 'Không tìm thấy đường tới vị trí đã chọn. Hãy kiểm tra lại tọa độ.');
  return { distanceMeters: route.distance, durationSeconds: route.duration, routingProvider: 'OSRM', calculatedAt: new Date() };
}
module.exports = { LIMIT_METERS, provinceKey, addressKey, activeShipment, shipmentGuard, currentPlan, internalAllowed, roadDistance };
