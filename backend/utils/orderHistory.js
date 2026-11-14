// Lịch sử đơn hàng (Order.statusHistory): mỗi lần đổi trạng thái / có hoạt động thì thêm 1 dòng.

// Tạo 1 dòng lịch sử. Lưu sẵn TÊN + vai trò + chi nhánh của người thao tác tại thời điểm đó
// (sau này tài khoản đổi tên / bị xóa / chuyển chi nhánh, lịch sử vẫn đúng như lúc xảy ra).
// eventType: 'status' (đổi trạng thái) | 'activity' (hoạt động khác: thanh toán, phân công...)
function historyEntry(req, status, note, changes, storeName, eventType = 'activity', storeId) {
  return {
    status, note, eventType, storeId, changedAt: new Date(), changedBy: req.account?._id, // ai, lúc nào
    actorName: req.account?.name || req.account?.displayName || (req.accountRole === 'system' ? 'Hệ thống GHN' : 'Khách hàng'), // tên nhân viên / khách
    actorRole: req.accountRole, storeName: storeName || req.storeScope?.currentStore?.name || req.account?.storeId?.name, changes // changes: { truong: { from, to } }
  };
}

// Bổ sung tên người thao tác cho các dòng lịch sử CŨ (tạo trước khi có actorName) - tra 1 lần cho mọi đơn
async function enrichHistory(documents) {
  const orders = documents.map(d => d.toObject ? d.toObject() : d); // document -> object thường (sửa được tự do)
  // Gom id người thao tác của các dòng thiếu tên (Set để bỏ trùng)
  const ids = [...new Set(orders.flatMap(o => (o.statusHistory || []).filter(h => !h.actorName && h.changedBy).map(h => String(h.changedBy))))];
  const [admins, customers] = await Promise.all([ // id có thể là nhân viên hoặc khách -> tra cả 2 bảng
    require('../models/Admin').find({ _id: { $in: ids } }).select('name role').lean(),
    require('../models/User').find({ _id: { $in: ids } }).select('displayName').lean()
  ]);
  const actors = new Map([...admins, ...customers].map(a => [String(a._id), a])); // id -> tài khoản
  for (const o of orders) {
    for (const h of o.statusHistory || []) {
      const actor = actors.get(String(h.changedBy));
      if (!h.actorName && actor) { h.actorName = actor.name || actor.displayName; h.actorRole = actor.role || 'customer'; } // điền tên còn thiếu
    }
    // Id cũ tra được tên, nhưng tên chi nhánh / tên lúc đó thì không dựng lại được.
    // Đơn cũ chưa có confirmedAt: lấy từ dòng lịch sử "confirmed" gần nhất (dừng nếu gặp "pending" - đơn quay lại từ đầu)
    if (!o.confirmedAt && o.status !== 'pending') {
      for (const h of [...(o.statusHistory || [])].reverse()) { // duyệt từ mới về cũ
        if (h.eventType === 'activity') continue; // bỏ qua hoạt động
        if (h.status === 'confirmed') {
          o.confirmedAt = h.changedAt; o.confirmedByName = h.actorName; o.confirmedStoreName = h.storeName;
          break;
        }
        if (h.status === 'pending') break;
      }
    }
  }
  return orders;
}
module.exports = { historyEntry, enrichHistory };
