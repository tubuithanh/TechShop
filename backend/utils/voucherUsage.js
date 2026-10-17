const Voucher = require('../models/Voucher');

// Trả lại 1 lượt dùng mã giảm giá khi đơn dùng mã bị hủy / trả hàng (kể cả tự hủy do quá hạn thanh toán).
// Trước đây lượt chỉ được trả khi tạo đơn thất bại, nên mỗi đơn hủy vẫn chiếm 1 lượt của mã -> mã giới hạn
// lượt dùng hết sớm dù chưa ai thật sự dùng. Không để usedCount âm. Lần đổi trạng thái sang hủy / trả hàng
// là cập nhật có điều kiện (chỉ thành công 1 lần), nên lượt cũng chỉ được trả 1 lần.
// Trong transaction (có session) thì để lỗi nổi lên cho transaction hủy cả khối; ngoài transaction chỉ ghi log.
async function releaseVoucher(order, session = null) {
  if (!order?.voucherCode) return;
  const code = String(order.voucherCode).toUpperCase(); // đơn cũ có thể lưu mã đúng như khách gõ
  try {
    await Voucher.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
  } catch (err) {
    if (session) throw err;
    console.error(`[Voucher] Lỗi trả lượt mã ${order.voucherCode}:`, err.message);
  }
}

module.exports = { releaseVoucher };
