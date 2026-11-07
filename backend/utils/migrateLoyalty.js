const Order = require('../models/Order');
const User = require('../models/User');
const { pointsForOrder, getLoyaltyConfig } = require('./loyalty');

// Cộng bù điểm thành viên cho các đơn ĐÃ GIAO trước khi có tính năng tích điểm (chạy mỗi lần khởi động, lần sau
// không còn gì để làm). Đơn chưa có trường loyaltyPoints = chưa xét. Mỗi đơn được "nhận" bằng lệnh cập nhật có
// điều kiện (loyaltyPoints chưa tồn tại) rồi mới cộng cho khách, nên chạy lại / chạy song song không cộng trùng.
// Đơn ở trạng thái khác chỉ được đánh dấu 0 điểm (đơn đã trả hàng trước đây chưa từng được cộng nên không trừ).
async function migrateLoyalty() {
  // Đang tắt tích điểm: chưa cộng bù (để nguyên, khi bật lại lần khởi động sau mới cộng)
  const config = await getLoyaltyConfig();
  if (!config.enabled) return { orders: 0, points: 0, skipped: true };
  let orders = 0;
  let points = 0;
  const cursor = Order.find({ status: 'delivered', loyaltyPoints: { $exists: false } })
    .select('userId itemsTotal discountAmount')
    .lean()
    .cursor();
  for await (const order of cursor) {
    const p = pointsForOrder(order, config);
    const claimed = await Order.updateOne({ _id: order._id, loyaltyPoints: { $exists: false } }, { $set: { loyaltyPoints: p } });
    if (!claimed.modifiedCount || p <= 0) continue;
    await User.updateOne({ _id: order.userId }, { $inc: { loyaltyPoints: p } });
    orders += 1;
    points += p;
  }
  await Order.updateMany({ status: { $ne: 'delivered' }, loyaltyPoints: { $exists: false } }, { $set: { loyaltyPoints: 0 } });
  return { orders, points };
}

module.exports = { migrateLoyalty };
