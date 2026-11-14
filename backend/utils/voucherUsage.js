const Voucher = require('../models/Voucher'); // mã giảm giá

// Trả lại 1 lượt dùng mã giảm giá khi đơn dùng mã bị hủy / trả hàng (kể cả tự hủy do quá hạn thanh toán).
// Trước đây lượt chỉ được trả khi tạo đơn thất bại, nên mỗi đơn hủy vẫn chiếm 1 lượt của mã -> mã giới hạn
// lượt dùng hết sớm dù chưa ai thật sự dùng. Không để usedCount âm. Lần đổi trạng thái sang hủy / trả hàng
// là cập nhật có điều kiện (chỉ thành công 1 lần), nên lượt cũng chỉ được trả 1 lần.
// Trong transaction (có session) thì để lỗi nổi lên cho transaction hủy cả khối; ngoài transaction chỉ ghi log.
// Trả luôn suất / ngân sách của chương trình khuyến mãi tự động mà đơn đã dùng (utils/promotions.js).
async function releaseVoucher(order, session = null) {
  // Đơn hỏa tốc bị hủy CHƯA giao -> trả lại 1 suất cho khung giờ (đơn đã giao rồi trả hàng thì suất đã dùng)
  if (order?.express?.windowId && order.status !== 'delivered' && !order.returnWasDelivered) {
    try {
      // ordersCount > 0: không để số đơn của khung giờ bị âm
      await require('../models/ExpressWindow').updateOne({ _id: order.express.windowId, ordersCount: { $gt: 0 } }, { $inc: { ordersCount: -1 } }, { session });
    } catch (err) { if (session) throw err; console.error('[Express] Lỗi trả suất hỏa tốc:', err.message); }
  }
  try {
    await require('./promotions').releasePromotions(order, session); // trả suất + ngân sách khuyến mãi tự động
  } catch (err) {
    if (session) throw err;
    console.error('[Promotion] Lỗi trả suất khuyến mãi:', err.message);
  }
  if (!order?.voucherCode) return; // đơn không dùng mã -> xong
  const code = String(order.voucherCode).toUpperCase(); // đơn cũ có thể lưu mã đúng như khách gõ
  try {
    await Voucher.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session }); // giảm 1 lượt đã dùng (không âm)
  } catch (err) {
    if (session) throw err;
    console.error(`[Voucher] Lỗi trả lượt mã ${order.voucherCode}:`, err.message);
  }
}

module.exports = { releaseVoucher };
