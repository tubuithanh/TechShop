require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = require('./app');
const connectDB = require('./config/db');
const { attachSocket } = require('./utils/socketServer');

const PORT = process.env.PORT || 5000;
const HTTPS_PORT = process.env.HTTPS_PORT || 5443;

connectDB().then(() => {
  // Chưa có dữ liệu tỉnh/thành, phường/xã -> nạp dữ liệu mặc định (chỉ lần đầu)
  require('./utils/seedLocations')
    .ensureLocationsSeeded()
    .then((r) => r && console.log(`[Locations] Đã nạp ${r.provinces} tỉnh/thành, ${r.wards} phường/xã`))
    .catch((err) => console.error('[Locations] Lỗi nạp dữ liệu:', err.message));
  // Tài khoản Zalo: bỏ email tạm (zalo<id>@zalo.techshop.local), email để trống; đổi chỉ số email (chỉ lần đầu)
  require('./utils/migrateUserEmails')
    .migrateUserEmails()
    .then((r) => (r.droppedOldIndex || r.clearedPlaceholders) && console.log(`[Users] Đã xóa email tạm của ${r.clearedPlaceholders} tài khoản Zalo`))
    .catch((err) => console.error('[Users] Lỗi chuyển đổi email:', err.message));
});

const server = http.createServer(app);

// Server HTTPS song song (dùng chung app Express) chỉ để phục vụ callback đăng nhập Zalo -
// Zalo bắt buộc Home URL/Callback URL phải là https, kể cả khi test trên localhost. Chứng chỉ
// tự ký (self-signed) trong backend/certs/ nên KHÔNG commit lên git (đã thêm vào .gitignore).
// Không ảnh hưởng tới luồng http://localhost:5000 hiện có của app (frontend vẫn gọi qua đó).
const certKeyPath = path.join(__dirname, 'certs', 'key.pem');
const certPath = path.join(__dirname, 'certs', 'cert.pem');
if (fs.existsSync(certKeyPath) && fs.existsSync(certPath)) {
  https
    .createServer({ key: fs.readFileSync(certKeyPath), cert: fs.readFileSync(certPath) }, app)
    .on('error', (err) => {
      // Server HTTPS này chỉ phục vụ test đăng nhập Zalo ở máy local - không được để lỗi của nó (VD:
      // cổng đang bị 1 tiến trình khác chiếm) làm sập luôn API chính ở cổng PORT.
      console.warn(`[Server] Không mở được HTTPS cổng ${HTTPS_PORT} (${err.code}) - bỏ qua, API chính vẫn chạy bình thường`);
    })
    .listen(HTTPS_PORT, () => {
      console.log(`[Server] HTTPS (dùng cho callback Zalo) chạy tại https://localhost:${HTTPS_PORT}`);
    });
}

// ----- Socket.io: real-time (theo dõi đơn hàng, thông báo, chat) - xem utils/socketServer.js -----
attachSocket(server, app);

// Tự hủy đơn VNPay quá hạn chưa thanh toán (trả lại tồn kho) - chạy mỗi 5 phút
const { expireUnpaidVnpayOrders } = require('./utils/expireUnpaidOrders');
const { restoreStock } = require('./controllers/orderController');
const runExpireJob = () =>
  expireUnpaidVnpayOrders({ restoreStock })
    .then((n) => n && console.log(`[VNPay] Đã tự hủy ${n} đơn quá hạn thanh toán`))
    .catch((err) => console.error('[VNPay] Lỗi khi hủy đơn quá hạn:', err.message));
setInterval(runExpireJob, 5 * 60 * 1000).unref();
setTimeout(runExpireJob, 30 * 1000).unref();

// Dọn nhật ký thao tác quá số ngày lưu cấu hình trong Cấu hình hệ thống (mỗi giờ)
const { purgeOldAuditLogs } = require('./utils/auditRetention');
const runAuditPurge = () =>
  purgeOldAuditLogs()
    .then((n) => n && console.log(`[AuditLog] Đã xóa ${n} nhật ký quá hạn lưu`))
    .catch((err) => console.error('[AuditLog] Lỗi dọn nhật ký:', err.message));
setInterval(runAuditPurge, 60 * 60 * 1000).unref();
setTimeout(runAuditPurge, 60 * 1000).unref(); // lần đầu sau khi server khởi động xong

server.listen(PORT, () => {
  console.log(`[Server] Đang chạy tại http://localhost:${PORT}`);
});
