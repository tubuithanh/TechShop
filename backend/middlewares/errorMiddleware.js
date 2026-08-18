// Middleware xử lý route không tồn tại
const notFound = (req, res, next) => {
  res.status(404).json({ message: `Không tìm thấy đường dẫn: ${req.originalUrl}` });
};

// Middleware xử lý lỗi tập trung
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err.message);
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message || 'Lỗi hệ thống, vui lòng thử lại sau',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
};

module.exports = { notFound, errorHandler };
