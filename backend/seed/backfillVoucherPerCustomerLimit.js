/**
 * Script một lần: đặt perCustomerLimit = 0 (không giới hạn) cho TẤT CẢ voucher đã tồn tại trong
 * database TRƯỚC KHI field này được thêm vào schema (backend/models/Voucher.js). Field mới có
 * default = 1 (giả định hợp lý cho voucher tạo MỚI sau này), nhưng nếu không chạy backfill này,
 * mọi voucher CŨ (trước đây vốn không giới hạn số lần dùng/khách) sẽ ĐỘT NGỘT bị giới hạn còn 1
 * lần/khách ngay khi được đọc lại - một thay đổi hành vi ngầm, không ai chủ ý cấu hình.
 * Chạy: node seed/backfillVoucherPerCustomerLimit.js
 * Chạy trên Atlas (production): MONGO_URI="<atlas-connection-string>" node seed/backfillVoucherPerCustomerLimit.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Đã kết nối MongoDB:', mongoose.connection.name);

  // updateMany bỏ qua middleware/hydration-default của Mongoose nên field chưa tồn tại trong
  // document thô sẽ không tự có perCustomerLimit=1 - dùng $exists:false để chỉ chạm đúng các
  // voucher CŨ, không đụng tới voucher đã có field này (tạo mới sau khi deploy).
  const result = await Voucher.updateMany(
    { perCustomerLimit: { $exists: false } },
    { $set: { perCustomerLimit: 0 } }
  );
  console.log(`Đã cập nhật ${result.modifiedCount} voucher cũ sang perCustomerLimit=0 (không giới hạn/khách).`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Lỗi khi chạy backfillVoucherPerCustomerLimit:', err);
  process.exit(1);
});
