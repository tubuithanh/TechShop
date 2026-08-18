const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { notFound, errorHandler } = require('./middlewares/errorMiddleware');
const auditLogger = require('./middlewares/auditLogger');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const brandRoutes = require('./routes/brandRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const storeInventoryRoutes = require('./routes/storeInventoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const warrantyRoutes = require('./routes/warrantyRoutes');
const voucherRoutes = require('./routes/voucherRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const storeRoutes = require('./routes/storeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const postRoutes = require('./routes/postRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// ----- Middlewares nền tảng -----
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Giới hạn số lần gọi API đăng nhập để chống brute-force (bảo mật)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Bạn đã thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút' }
});
app.use('/api/auth/login', loginLimiter);

// Ghi nhật ký thao tác quản trị (chỉ log khi tài khoản thuộc collection admins)
app.use(auditLogger);

// ----- Route health-check -----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MERN E-commerce API đang hoạt động', database: 'ecommerce_multistore_db' });
});

// ----- Đăng ký các route chính -----
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/store-inventories', storeInventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/warranties', warrantyRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/chat', chatRoutes);

// ----- Xử lý lỗi -----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
