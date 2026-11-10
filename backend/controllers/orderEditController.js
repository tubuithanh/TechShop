const Order = require('../models/Order');
const { inScope } = require('./orderController');
const { historyEntry } = require('../utils/orderHistory');
const asyncHandler = require('../utils/asyncHandler');
const { activeShipment, shipmentGuard } = require('../utils/deliveryRouting');

module.exports = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  if (!inScope(req, order)) return res.status(403).json({ message: 'Đơn thuộc chi nhánh khác' });
  if (!['pending', 'confirmed'].includes(order.status) || order.activeTransferId || activeShipment(order)) return res.status(409).json({ message: 'Chỉ sửa đơn chưa xử lý, không chờ điều phối và chưa có vận đơn hoạt động' });
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 1000) return res.status(400).json({ message: 'Nhập lý do sửa, tối đa 1000 ký tự' });
  const set = {}, changes = {};
  // Address changes are deferred until routing/fee recalculation is available.
  for (const [key, max] of [['note', 1000], ['deliveryAddress.fullName', 120], ['deliveryAddress.phone', 20]]) {
    const field = key.split('.').pop();
    const value = key.includes('.') ? req.body.deliveryAddress?.[field] : req.body[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > max || (field !== 'note' && !value.trim())) return res.status(400).json({ message: 'Thông tin không hợp lệ' });
    if (field === 'phone' && !/^(0|\+84)[0-9]{9,10}$/.test(value.trim())) return res.status(400).json({ message: 'Số điện thoại không hợp lệ' });
    const before = key.includes('.') ? order.deliveryAddress?.[field] || '' : order[key] || '';
    if (before !== value.trim()) { set[key] = value.trim(); changes[key] = { from: before, to: value.trim() }; }
  }
  if (!Object.keys(set).length) return res.json({ data: order });
  // Query updates do not run the search plugin's document validation hook.
  order.set(set);
  set.searchTokens = await Order.computeSearchTokens(order);
  const branch = await require('../models/Store').findById(order.storeId).select('name').lean();
  const updated = await Order.findOneAndUpdate({ _id: order._id, storeId: order.storeId, status: order.status, activeTransferId: null, __v: order.__v, ...shipmentGuard(order) }, {
    $set: set, $inc: { __v: 1 }, $push: { statusHistory: historyEntry(req, order.status, `Sửa thông tin: ${reason}`, changes, branch?.name) }
  }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Đơn vừa thay đổi, vui lòng tải lại' });
  res.json({ data: updated });
});
