/**
 * Sửa trạng thái thanh toán của đơn hàng MẪU thanh toán online (VNPay/MoMo/chuyển khoản) cho hợp lý với
 * quy tắc mới "phải thanh toán xong mới được xác nhận đơn":
 *   - đơn đã qua "chờ xác nhận" (confirmed/processing/shipping/delivered) mà còn "chưa thanh toán" -> "đã thanh toán"
 *   - đơn đã hủy/trả hàng -> "đã hoàn tiền"
 * Không đụng tới đơn COD và đơn đang "chờ xác nhận". Chạy lại nhiều lần an toàn.
 *
 * Chạy:        node seed/backfillOnlinePaymentStatus.js
 * Trên Atlas:  MONGO_URI="<atlas-connection-string>" node seed/backfillOnlinePaymentStatus.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const orders = mongoose.connection.db.collection('orders');
  console.log('Đã kết nối MongoDB:', mongoose.connection.db.databaseName);
  const online = { paymentMode: { $ne: 'cod' } };
  const paid = await orders.updateMany(
    { ...online, status: { $in: ['confirmed', 'processing', 'shipping', 'delivered'] }, paymentStatus: { $ne: 'paid' } },
    { $set: { paymentStatus: 'paid' } }
  );
  const refunded = await orders.updateMany(
    { ...online, status: { $in: ['cancelled', 'returned'] }, paymentStatus: 'failed' },
    { $set: { paymentStatus: 'refunded' } }
  );
  console.log(`Đã chuyển ${paid.modifiedCount} đơn online sang "đã thanh toán", ${refunded.modifiedCount} đơn hủy/trả sang "đã hoàn tiền"`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillOnlinePaymentStatus:', err);
  process.exit(1);
});
