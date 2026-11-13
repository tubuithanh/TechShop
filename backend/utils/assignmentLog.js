// Nhật ký phân công giao hàng trên đơn (Order.assignmentLog): ai phân công / đổi người / gỡ / tạo - hủy vận đơn,
// lúc nào, giao cho ai hoặc đơn vị nào. Lưu kèm TÊN người thao tác tại thời điểm đó (tài khoản đổi tên / bị xóa vẫn còn).
const METHOD_LABEL = { internal: 'Shop tự giao', simulation: 'Đơn vị vận chuyển (giả lập)', ghn_sandbox: 'GHN sandbox' };

function assignmentEntry(req, { action, method, shipper, carrierCode, note } = {}) {
  return {
    at: new Date(),
    by: req.account?._id,
    byName: req.account?.name || 'Hệ thống',
    byRole: req.accountRole,
    action,
    method,
    shipperId: shipper?._id,
    shipperName: shipper?.name,
    carrierCode,
    note
  };
}

// Các trường "người phân công gần nhất" hiển thị nhanh ở danh sách
const assignedBySet = (req) => ({ assignedBy: req.account?._id, assignedByName: req.account?.name || 'Hệ thống', assignedAt: new Date() });

module.exports = { assignmentEntry, assignedBySet, METHOD_LABEL };
