// =====================================================================================================
// server.js - ĐIỂM KHỞI CHẠY của backend: nạp cấu hình, kết nối MongoDB, mở cổng HTTP/HTTPS,
// gắn Socket.io (thời gian thực) và chạy các tác vụ nền định kỳ (tự hủy đơn, đồng bộ GHN, dọn nhật ký).
// Chạy bằng: npm run dev (nodemon tự khởi động lại khi sửa code) hoặc npm start (production).
// =====================================================================================================

require('dotenv').config(); // đọc file backend/.env và đưa các biến (MONGO_URI, JWT_*...) vào process.env
const fs = require('fs'); // module có sẵn của Node: làm việc với file (kiểm tra file chứng chỉ có tồn tại không)
const path = require('path'); // module có sẵn: ghép đường dẫn file đúng chuẩn cho mọi hệ điều hành
const http = require('http'); // module có sẵn: tạo máy chủ HTTP
const https = require('https'); // module có sẵn: tạo máy chủ HTTPS (chỉ dùng cho callback Zalo ở máy local)

const app = require('./app'); // ứng dụng Express đã khai báo đầy đủ middleware + route (xem app.js)
const connectDB = require('./config/db'); // hàm kết nối MongoDB (xem config/db.js)
const { migrateChat } = require('./utils/migrateChat'); // chuyển đổi dữ liệu chat cũ sang cấu trúc mới (chạy 1 lần)
const { attachSocket } = require('./utils/socketServer'); // gắn Socket.io vào máy chủ HTTP

const PORT = process.env.PORT || 5000; // cổng HTTP chính: lấy từ biến môi trường (Render tự cấp), mặc định 5000
const HTTPS_PORT = process.env.HTTPS_PORT || 5443; // cổng HTTPS phụ cho đăng nhập Zalo, mặc định 5443

// Kiểm tra cấu hình bắt buộc NGAY khi khởi động: thiếu khóa ký token thì mọi lần đăng nhập đều lỗi 500 khó hiểu
// (jsonwebtoken báo "secretOrPrivateKey must have a value") -> dừng sớm với thông báo rõ ràng.
const missingSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !process.env[k]); // lọc ra các biến còn thiếu
if (missingSecrets.length) { // có ít nhất 1 biến chưa khai báo
  console.error(`[Server] Thiếu biến môi trường: ${missingSecrets.join(', ')} (khai báo trong backend/.env hoặc Environment trên Render)`); // in rõ thiếu biến nào
  process.exit(1); // thoát với mã lỗi 1 -> Render / nodemon biết là khởi động thất bại
}

// dbReady: Promise hoàn tất khi đã kết nối DB + chạy xong các bước chuyển đổi dữ liệu bắt buộc.
// Server chỉ mở cổng SAU KHI dbReady xong (dòng cuối file) để không nhận request khi dữ liệu chưa sẵn sàng.
const dbReady = connectDB().then(async () => { // kết nối MongoDB, xong thì chạy tiếp các bước bên trong
  await migrateChat(); // chuyển đổi dữ liệu chat cũ (chạy lại nhiều lần vẫn an toàn)
  await require('./utils/migrateProductReviews').migrateProductReviews(); // hiện lại đánh giá từng bị ẩn + tính lại điểm sao (chỉ lần đầu)
  await Promise.all([require('./models/Order').init(), require('./models/DeliveryEvidence').init()]); // tạo đủ chỉ số (index) cho 2 collection cần ràng buộc duy nhất trước khi nhận đơn
  // Chưa có dữ liệu tỉnh/thành, phường/xã -> nạp dữ liệu mặc định (chỉ lần đầu)
  require('./utils/seedLocations') // nạp module nạp dữ liệu địa chỉ
    .ensureLocationsSeeded() // chỉ nạp khi collection đang trống
    .then((r) => r && console.log(`[Locations] Đã nạp ${r.provinces} tỉnh/thành, ${r.wards} phường/xã`)) // có nạp thì in số lượng
    .catch((err) => console.error('[Locations] Lỗi nạp dữ liệu:', err.message)); // lỗi thì chỉ ghi log, không chặn server
  // Tài khoản Zalo: bỏ email tạm (zalo<id>@zalo.techshop.local), email để trống; đổi chỉ số email (chỉ lần đầu)
  require('./utils/migrateUserEmails') // nạp module chuyển đổi email
    .migrateUserEmails() // xóa email tạm + đổi index email thành "không trùng nếu có"
    .then((r) => (r.droppedOldIndex || r.clearedPlaceholders) && console.log(`[Users] Đã xóa email tạm của ${r.clearedPlaceholders} tài khoản Zalo`)) // có thay đổi thì in log
    .catch((err) => console.error('[Users] Lỗi chuyển đổi email:', err.message)); // lỗi chỉ ghi log
  // Điểm thành viên: cộng bù cho các đơn đã giao trước khi có tính năng tích điểm (chỉ lần đầu)
  require('./utils/migrateLoyalty') // nạp module cộng bù điểm
    .migrateLoyalty() // cộng điểm cho đơn đã giao chưa từng được tính
    .then((r) => r.orders && console.log(`[Loyalty] Đã cộng bù ${r.points} điểm cho ${r.orders} đơn đã giao`)) // có cộng thì in log
    .catch((err) => console.error('[Loyalty] Lỗi cộng bù điểm:', err.message)); // lỗi chỉ ghi log
});

const server = http.createServer(app); // tạo máy chủ HTTP, mọi request được chuyển cho ứng dụng Express xử lý

// Server HTTPS song song (dùng chung app Express) chỉ để phục vụ callback đăng nhập Zalo -
// Zalo bắt buộc Home URL/Callback URL phải là https, kể cả khi test trên localhost. Chứng chỉ
// tự ký (self-signed) trong backend/certs/ nên KHÔNG commit lên git (đã thêm vào .gitignore).
// Không ảnh hưởng tới luồng http://localhost:5000 hiện có của app (frontend vẫn gọi qua đó).
const certKeyPath = path.join(__dirname, 'certs', 'key.pem'); // đường dẫn khóa riêng của chứng chỉ
const certPath = path.join(__dirname, 'certs', 'cert.pem'); // đường dẫn chứng chỉ
if (fs.existsSync(certKeyPath) && fs.existsSync(certPath)) { // chỉ mở HTTPS khi có đủ 2 file chứng chỉ
  https
    .createServer({ key: fs.readFileSync(certKeyPath), cert: fs.readFileSync(certPath) }, app) // tạo máy chủ HTTPS dùng chung app
    .on('error', (err) => { // bắt lỗi của riêng máy chủ HTTPS
      // Server HTTPS này chỉ phục vụ test đăng nhập Zalo ở máy local - không được để lỗi của nó (VD:
      // cổng đang bị 1 tiến trình khác chiếm) làm sập luôn API chính ở cổng PORT.
      console.warn(`[Server] Không mở được HTTPS cổng ${HTTPS_PORT} (${err.code}) - bỏ qua, API chính vẫn chạy bình thường`); // chỉ cảnh báo
    })
    .listen(HTTPS_PORT, () => { // bắt đầu lắng nghe ở cổng HTTPS
      console.log(`[Server] HTTPS (dùng cho callback Zalo) chạy tại https://localhost:${HTTPS_PORT}`); // báo đã mở cổng
    });
}

// ----- Socket.io: real-time (theo dõi đơn hàng, thông báo, chat) - xem utils/socketServer.js -----
attachSocket(server, app); // gắn Socket.io vào máy chủ HTTP và lưu vào app (req.app.get('io')) để controller phát sự kiện

// Tự hủy đơn VNPay / MoMo quá hạn chưa thanh toán (trả lại tồn kho) - chạy mỗi 5 phút
const { expireUnpaidVnpayOrders } = require('./utils/expireUnpaidOrders'); // hàm tìm + hủy đơn quá hạn thanh toán
const { restoreStock } = require('./controllers/orderController'); // hàm hoàn tồn kho (truyền vào để tránh vòng lặp require)
const runExpireJob = () => // hàm chạy 1 lượt tác vụ tự hủy
  expireUnpaidVnpayOrders({ restoreStock }) // hủy các đơn quá hạn, trả về số đơn đã hủy
    .then((n) => n && console.log(`[VNPay] Đã tự hủy ${n} đơn quá hạn thanh toán`)) // có hủy thì in log
    .catch((err) => console.error('[VNPay] Lỗi khi hủy đơn quá hạn:', err.message)); // lỗi chỉ ghi log, lượt sau chạy lại
setInterval(runExpireJob, 5 * 60 * 1000).unref(); // lặp mỗi 5 phút; unref() = không giữ tiến trình sống chỉ vì bộ hẹn giờ này
setTimeout(runExpireJob, 30 * 1000).unref(); // chạy lượt đầu sau 30 giây (đợi DB kết nối xong)

// Đồng bộ trạng thái vận đơn GHN mỗi phút bằng cách hỏi GHN (polling): chạy được cả local lẫn Render
// mà không phải mở 1 webhook công khai không xác thực. Vận đơn đã kết thúc thì ngừng hỏi.
const { pollShipments } = require('./controllers/shipmentController'); // hàm hỏi GHN và cập nhật đơn
setInterval(() => pollShipments(app).catch(err => console.warn('[GHN]', err.message)), 60000).unref(); // mỗi 60 giây, lỗi chỉ cảnh báo

// Dọn nhật ký thao tác quá số ngày lưu cấu hình trong Cấu hình hệ thống (mỗi giờ)
const { purgeOldAuditLogs } = require('./utils/auditRetention'); // hàm xóa nhật ký quá hạn
const runAuditPurge = () => // hàm chạy 1 lượt dọn nhật ký
  purgeOldAuditLogs() // xóa nhật ký cũ hơn số ngày cấu hình, trả về số bản ghi đã xóa
    .then((n) => n && console.log(`[AuditLog] Đã xóa ${n} nhật ký quá hạn lưu`)) // có xóa thì in log
    .catch((err) => console.error('[AuditLog] Lỗi dọn nhật ký:', err.message)); // lỗi chỉ ghi log
setInterval(runAuditPurge, 60 * 60 * 1000).unref(); // lặp mỗi giờ
setTimeout(runAuditPurge, 60 * 1000).unref(); // lần đầu sau khi server khởi động xong (1 phút)

dbReady.then(() => server.listen(PORT, () => { // CHỈ mở cổng HTTP khi dữ liệu đã sẵn sàng
  console.log(`[Server] Đang chạy tại http://localhost:${PORT}`); // báo server đã chạy
})).catch((err) => { // bước chuẩn bị dữ liệu thất bại
  console.error('[Server] Không thể khởi tạo dữ liệu:', err.message); // in lý do
  process.exit(1); // thoát với mã lỗi - không chạy server khi dữ liệu chưa sẵn sàng
});
