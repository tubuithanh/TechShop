// Báo cho KHÁCH khi vận đơn (đơn vị vận chuyển giả lập / GHN) chuyển sang các bước mà trạng thái ĐƠN HÀNG không thể
// hiện: shipper đang giao tới, giao thất bại (kèm lý do), bắt đầu chuyển hoàn. Các bước làm đơn đổi trạng thái
// (đã lấy hàng -> Đang giao, đã giao -> Đã giao) đã có thông báo + email riêng ở transitionOrder, không báo trùng.
const Notification = require('../models/Notification');

const RETURN_GROUP = new Set(['waiting_to_return', 'return', 'return_transporting', 'return_sorting', 'returning', 'return_fail', 'returned']);

// status vận đơn -> nội dung báo khách (null = không báo)
function eventMessage(status, previous, { code, note }) {
  if (status === 'delivering') {
    return { title: 'Shipper đang giao hàng tới bạn', message: `Vận đơn ${code} đang được giao. Vui lòng để ý điện thoại để nhận hàng.` };
  }
  if (status === 'delivery_fail') {
    return { title: 'Giao hàng chưa thành công', message: `Vận đơn ${code} chưa giao được${note ? `: ${note}` : ''}. Đơn vị vận chuyển sẽ liên hệ giao lại.` };
  }
  // Chỉ báo LẦN ĐẦU chuyển sang nhóm hoàn hàng (không báo từng bước nhỏ của quá trình hoàn)
  if (RETURN_GROUP.has(status) && !RETURN_GROUP.has(previous)) {
    return { title: 'Đơn hàng đang được chuyển hoàn', message: `Vận đơn ${code} đang được trả về cửa hàng${note ? `: ${note}` : ''}. Cửa hàng sẽ liên hệ với bạn.` };
  }
  return null;
}

// Gọi sau khi trạng thái vận đơn ĐÃ đổi. Không làm hỏng luồng đồng bộ nếu gửi lỗi.
async function notifyShipmentEvent(order, status, previous, note) {
  if (!order?.userId || !order.shipment?.code || status === previous) return;
  const content = eventMessage(status, previous, { code: order.shipment.code, note });
  if (!content) return;
  try {
    await Notification.create({ userId: order.userId, type: 'order', ...content, link: `/account/orders/${order._id}` });
    require('./notifyEmail').emailShipmentEvent(order, content);
  } catch (err) {
    console.warn('[Vận đơn] Không gửi được thông báo:', err.message);
  }
}

module.exports = { notifyShipmentEvent, eventMessage, RETURN_GROUP };
