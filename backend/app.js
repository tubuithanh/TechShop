// =====================================================================================================
// app.js - KHAI BÁO ỨNG DỤNG EXPRESS: thứ tự middleware (bảo mật, CORS, đọc JSON, giới hạn tần suất,
// làm sạch dữ liệu, ghi log) rồi đăng ký các nhóm route /api/... và cuối cùng là bộ xử lý lỗi.
// Tách riêng khỏi server.js để test (Supertest) nạp app mà không phải mở cổng / kết nối DB thật.
// LƯU Ý: thứ tự app.use() QUAN TRỌNG - request đi qua các middleware từ trên xuống dưới.
// =====================================================================================================

// Đóng dấu người thao tác (ai tạo / sửa / ẩn) lên mọi bảng chính - PHẢI đăng ký trước khi nạp bất kỳ model nào
// (plugin toàn cục chỉ áp dụng cho model biên dịch SAU khi đăng ký). Không áp dụng cho bảng con (phiên bản sản phẩm...).
const mongoose = require('mongoose'); // thư viện Mongoose
const auditStamp = require('./utils/auditStamp'); // plugin đóng dấu createdBy/updatedBy + vùng nhớ theo request
mongoose.set('applyPluginsToChildSchemas', false); // không gắn plugin vào schema con (mảng con trong document)
mongoose.plugin(auditStamp.auditPlugin); // gắn plugin cho TẤT CẢ model được tạo sau dòng này

const express = require('express'); // framework web
const cors = require('cors'); // cho phép frontend ở tên miền khác gọi API
const morgan = require('morgan'); // in log mỗi request ra console (method, URL, mã trạng thái, thời gian)
const cookieParser = require('cookie-parser'); // đọc cookie vào req.cookies (cần cho refresh token)
const helmet = require('helmet'); // thêm các header bảo mật HTTP
const sanitizeInput = require('./middlewares/sanitizeInput'); // chống tấn công NoSQL injection

const { notFound, errorHandler } = require('./middlewares/errorMiddleware'); // xử lý 404 + lỗi chung
const auditLogger = require('./middlewares/auditLogger'); // ghi nhật ký thao tác của nhân viên
const paginationGuard = require('./middlewares/paginationGuard'); // kiểm tra tham số phân trang
const { apiLimiter, loginLimiter } = require('./middlewares/rateLimits'); // giới hạn số request

// ----- Nạp các nhóm route (mỗi file khai báo URL con + middleware quyền + controller) -----
const authRoutes = require('./routes/authRoutes'); // đăng nhập / đăng ký / refresh / đăng xuất
const { zaloCallback } = require('./controllers/authController'); // hàm xử lý Zalo gọi về sau khi đăng nhập
const userRoutes = require('./routes/userRoutes'); // hồ sơ khách hàng, địa chỉ
const brandRoutes = require('./routes/brandRoutes'); // thương hiệu
const categoryRoutes = require('./routes/categoryRoutes'); // danh mục
const productRoutes = require('./routes/productRoutes'); // sản phẩm
const storeInventoryRoutes = require('./routes/storeInventoryRoutes'); // tồn kho theo chi nhánh
const cartRoutes = require('./routes/cartRoutes'); // giỏ hàng
const orderRoutes = require('./routes/orderRoutes'); // đơn hàng
const warrantyRoutes = require('./routes/warrantyRoutes'); // yêu cầu bảo hành
const voucherRoutes = require('./routes/voucherRoutes'); // mã giảm giá
const promotionRoutes = require('./routes/promotionRoutes'); // chương trình khuyến mãi
const warrantyCardRoutes = require('./routes/warrantyCardRoutes'); // phiếu bảo hành
const notificationRoutes = require('./routes/notificationRoutes'); // thông báo
const dashboardRoutes = require('./routes/dashboardRoutes'); // thống kê
const storeRoutes = require('./routes/storeRoutes'); // chi nhánh
const reviewRoutes = require('./routes/reviewRoutes'); // đánh giá
const postRoutes = require('./routes/postRoutes'); // bài viết / tin tức
const collectionRoutes = require('./routes/collectionRoutes'); // bộ sưu tập sản phẩm
const auditLogRoutes = require('./routes/auditLogRoutes'); // xem nhật ký thao tác
const locationRoutes = require('./routes/locationRoutes'); // tỉnh/thành, phường/xã
const slideRoutes = require('./routes/slideRoutes'); // banner trang chủ
const chatRoutes = require('./routes/chatRoutes'); // chat hỗ trợ
const settingRoutes = require('./routes/settingRoutes'); // cấu hình hệ thống
const permissionGroupRoutes = require('./routes/permissionGroupRoutes'); // nhóm quyền
const staffRoutes = require('./routes/staffRoutes'); // nhân viên
const paymentRoutes = require('./routes/paymentRoutes'); // VNPay / MoMo
const uploadRoutes = require('./routes/uploadRoutes'); // tải ảnh lên
const deliveryRoutes = require('./routes/deliveryRoutes'); // phân công giao hàng
const { UPLOAD_DIR } = require('./controllers/uploadController'); // thư mục lưu ảnh khi không dùng Cloudinary

const app = express(); // tạo ứng dụng Express
// Render (và hầu hết nền tảng hosting) đặt 1 proxy phía trước: tin 1 lớp proxy để req.ip là IP THẬT của khách.
// Trước đây thiếu dòng này nên mọi khách có chung IP của proxy -> giới hạn đăng nhập 20 lần/15 phút bị áp
// dụng chung cho cả website, còn URL ảnh tải lên dùng sai giao thức.
app.set('trust proxy', 1);

// ----- Middlewares nền tảng -----
// Header bảo mật (chống nhúng iframe, đoán kiểu nội dung, ẩn X-Powered-By...). Ảnh tải lên (/uploads) được
// trang frontend ở tên miền khác hiển thị nên phải cho phép tải chéo tên miền (cross-origin).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173', // CHỈ tên miền frontend được gọi API (mặc định Vite dev)
    credentials: true // cho phép gửi kèm cookie (refresh token) khi gọi chéo tên miền
  })
);
app.use(auditStamp.requestContext); // vùng nhớ theo request: trang đang thao tác + người thao tác (utils/auditStamp.js)
app.use(express.json({ limit: '5mb' })); // đọc body JSON vào req.body, tối đa 5MB (chặn request quá lớn)
app.use('/api', apiLimiter); // giới hạn chung cho toàn bộ API (xem middlewares/rateLimits.js)
app.use('/api', paginationGuard); // limit tối đa 200, page là số nguyên >= 1
app.use(express.urlencoded({ extended: true })); // đọc body dạng form (VNPay/MoMo gọi về dùng kiểu này)
app.use(cookieParser()); // đọc cookie
app.use(sanitizeInput); // bỏ khóa "$..." (toán tử MongoDB) khỏi body / query / params
if (process.env.NODE_ENV !== 'test') { // khi chạy test thì không in log cho đỡ rối
  app.use(morgan('dev')); // in log request dạng ngắn gọn
}

// Giới hạn số lần gọi API đăng nhập để chống brute-force (bảo mật)
app.use('/api/auth/login', loginLimiter);

// Ghi nhật ký thao tác quản trị (chỉ log khi tài khoản thuộc collection admins)
app.use(auditLogger);

// ----- Route health-check -----
app.get('/api/health', (req, res) => { // Render / người vận hành gọi để biết server còn sống
  res.json({ status: 'ok', message: 'MERN E-commerce API đang hoạt động', database: 'ecommerce_multistore_db' });
});

// Đường dẫn RÚT GỌN cho callback Zalo (giống hệt /api/auth/zalo/callback) - chỉ dùng khi test qua
// các tunnel công khai (Cloudflare quick tunnel, localtunnel...) có domain ngẫu nhiên dài, vì Zalo
// giới hạn ô "Tiền tố URL" tối đa 75 ký tự nên URL đầy đủ .../api/auth/zalo/callback/ dễ bị vượt quá.
app.get('/api/zc', zaloCallback);

// Nội dung file xác minh tên miền Zalo yêu cầu (mã xác minh công khai, không phải bí mật)
const ZALO_VERIFIER_HTML =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta property="zalo-platform-site-verification" content="NDMO0fkd2pPgrvawuDmlO3Bug3VUZd9XD3Kt" />\n' +
  '</head>\n<body>\nThere Is No Limit To What You Can Accomplish Using Zalo!\n</body>\n</html>\n';
app.get('/api/zc/zalo_verifierNDMO0fkd2pPgrvawuDmlO3Bug3VUZd9XD3Kt.html', (req, res) => { // xác minh cho tiền tố /api/zc
  res.type('html').send(ZALO_VERIFIER_HTML); // trả về dạng HTML
});
// Xác thực domain gốc (mục "Domain" trên dashboard Zalo, khác với "Tiền tố URL" của riêng route
// callback ở trên) - cần phục vụ đúng file này ở path gốc của domain backend triển khai thật (VD:
// techshop-twv1.onrender.com), vì backend không có gì serve file tĩnh ở root ngoài route này.
app.get('/zalo_verifierNDMO0fkd2pPgrvawuDmlO3Bug3VUZd9XD3Kt.html', (req, res) => {
  res.type('html').send(ZALO_VERIFIER_HTML);
});

// ----- Đăng ký các route chính: tiền tố URL -> nhóm route -----
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/store-inventories', storeInventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/express', require('./routes/expressRoutes')); // giao hỏa tốc 2 giờ
app.use('/api/store-health', require('./routes/storeHealthRoutes')); // sức khỏe chi nhánh
app.use('/api/einvoices', require('./routes/einvoiceRoutes')); // hóa đơn điện tử
app.use('/api/workspace', require('./routes/workspaceRoutes')); // Dashboard theo vai trò
app.use('/api/orders', orderRoutes);
app.use('/api/warranties', warrantyRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/warranty-cards', warrantyCardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/slides', slideRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/permission-groups', permissionGroupRoutes);
app.use('/api/staff-reports', require('./routes/staffReportRoutes')); // phải đứng TRƯỚC /api/staff để không bị nhầm tiền tố
app.use('/api/staff', staffRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/deliveries', deliveryRoutes);
// Ảnh upload khi chưa cấu hình Cloudinary (xem controllers/uploadController.js)
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, { // phục vụ file tĩnh trong thư mục ảnh
    maxAge: '7d', // trình duyệt được lưu bộ nhớ đệm 7 ngày
    // Không cho trình duyệt "đoán" lại kiểu file - file tải lên chỉ được hiểu đúng là ảnh
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
  })
);

// ----- Xử lý lỗi (PHẢI đứng cuối cùng) -----
app.use(notFound); // không route nào khớp -> tạo lỗi 404
app.use(errorHandler); // mọi lỗi (throw / next(err)) đổ về đây -> trả JSON { message } thống nhất

module.exports = app; // xuất app cho server.js và các file test
