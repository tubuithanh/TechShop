export const ORDER_LABELS = {
  pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', processing: 'Đang chuẩn bị',
  ready_for_pickup: 'Sẵn sàng nhận', shipping: 'Đang giao', returning: 'Chờ nhận hàng trả',
  delivered: 'Đã bàn giao', cancelled: 'Đã hủy', returned: 'Đã nhận hàng trả'
};
export const orderLabel = o => o.status === 'delivered' && o.deliveryMethod === 'home_delivery' ? 'Đã giao hàng' : ORDER_LABELS[o.status] || o.status;
export const orderMethod = o => o.source === 'pos' ? 'Mua tại quầy' : o.deliveryMethod === 'store_pickup' ? 'Nhận tại cửa hàng' : 'Giao tận nơi';
export const money = v => (v ?? 0).toLocaleString('vi-VN') + 'đ';
export function orderActions(o) {
  if (['creating', 'unknown', 'active'].includes(o.shipment?.phase)) return o.status === 'confirmed' && o.shipment.environment === 'simulation' && o.shipment.phase === 'active' && o.shipment.status === 'ready_to_pick' ? ['processing'] : [];
  const next = { pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: o.deliveryMethod === 'store_pickup' ? ['ready_for_pickup', 'cancelled'] : ['cancelled'], ready_for_pickup: ['cancelled'], delivered: ['returning'] };
  return next[o.status] || [];
}
