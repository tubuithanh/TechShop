// Tiện ích giao hàng: khóa địa chỉ, kiểm tra vận đơn, quyền tự giao nội bộ, tính đường đi thật (OSRM).
const crypto = require('crypto');
const { httpJson } = require('./httpJson'); // gọi HTTP trả JSON
const { BusinessError } = require('./transaction');
const { normalizeSearch } = require('./search'); // bỏ dấu, chữ thường
const LIMIT_METERS = 20000; // shop tự giao trong bán kính 20 km đường đi
// "Tỉnh Bình Dương" / "TP. Hồ Chí Minh" -> "binhduong" / "hochiminh" để so sánh 2 tỉnh có trùng nhau không
function provinceKey(name) { return normalizeSearch(name).replace(/^(tinh|thanh pho|tp\.?)[\s.]*/g, '').replace(/[^a-z0-9]/g, ''); }
// Khóa địa chỉ = băm SHA-256 (chi nhánh + địa chỉ giao). Địa chỉ / chi nhánh đổi -> khóa đổi -> phương án giao cũ hết hiệu lực
function addressKey(order) {
  const a = order.deliveryAddress || {};
  return crypto.createHash('sha256').update(JSON.stringify([String(order.storeId?._id || order.storeId), a.addressLine1, a.addressLine2, a.city, a.state])).digest('hex');
}
// Đơn có vận đơn đang hoạt động với đơn vị vận chuyển (đang tạo / chưa rõ kết quả / đang chạy)
function activeShipment(order) { return ['creating', 'unknown', 'active'].includes(order.shipment?.phase); }
// Điều kiện thêm vào lệnh cập nhật: vận đơn chưa đổi kể từ lúc đọc (chống 2 thao tác chồng nhau)
function shipmentGuard(order) {
  return { 'shipment.phase': order.shipment?.phase || null, 'shipment.clientCode': order.shipment?.clientCode || null };
}
// Phương án giao đã tính có còn đúng với địa chỉ + chi nhánh hiện tại không
function currentPlan(order) {
  return order.deliveryPlan?.addressKey === addressKey(order) && String(order.deliveryPlan.storeId) === String(order.storeId?._id || order.storeId);
}
// Được phân công shipper nội bộ không: quản lý chủ động chọn tự giao, HOẶC (cùng tỉnh + đường đi <= 20 km)
function internalAllowed(order) {
  if (currentPlan(order) && order.deliveryPlan.mode === 'internal' && order.deliveryPlan.assignmentMode === 'manager_choice') return true;
  return currentPlan(order) && ['internal', 'express'].includes(order.deliveryPlan.mode) && order.deliveryPlan.sameProvince === true
    && Number.isFinite(order.deliveryPlan.distanceMeters) && order.deliveryPlan.distanceMeters >= 0 && order.deliveryPlan.distanceMeters <= LIMIT_METERS;
}
// Khoảng cách + thời gian đường bộ thật giữa 2 tọa độ (dịch vụ OSRM). Không tính được thì báo lỗi, KHÔNG đoán bừa.
async function roadDistance(from, to) {
  for (const p of [from, to]) if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) throw new BusinessError(400, 'Cần tọa độ hợp lệ của chi nhánh và nơi nhận hàng'); // kiểm tra vĩ độ / kinh độ
  const base = (await require('./shippingConfig').getShippingConfig()).routingApiUrl; // địa chỉ dịch vụ OSRM (cấu hình được)
  // OSRM nhận tọa độ dạng "kinhdo,vido"; radiuses=200: cho phép bám đường trong bán kính 200 m
  const url = new URL(`/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&radiuses=200;200`, base);
  let result;
  try { result = await httpJson(url); } catch { throw new BusinessError(503, 'Chưa tính được tuyến đường. Vui lòng thử lại; không tự suy đoán khoảng cách.'); }
  const route = result.data.routes?.[0]; // tuyến đường tốt nhất
  if (result.status !== 200 || result.data.code !== 'Ok' || !Number.isFinite(route?.distance) || route.distance < 0) throw new BusinessError(400, 'Không tìm thấy đường tới vị trí đã chọn. Hãy kiểm tra lại tọa độ.');
  return { distanceMeters: route.distance, durationSeconds: route.duration, routingProvider: 'OSRM', calculatedAt: new Date() }; // mét, giây
}
module.exports = { LIMIT_METERS, provinceKey, addressKey, activeShipment, shipmentGuard, currentPlan, internalAllowed, roadDistance };
