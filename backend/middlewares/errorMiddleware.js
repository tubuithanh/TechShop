// =====================================================================================================
// middlewares/errorMiddleware.js - 2 middleware đặt CUỐI app.js:
//   notFound: không route nào khớp URL -> trả 404
//   errorHandler: mọi lỗi (throw trong asyncHandler hoặc next(err)) đổ về đây -> trả JSON { message } thống nhất
// =====================================================================================================

// Middleware xử lý route không tồn tại
const notFound = (req, res, next) => {
  res.status(404).json({ message: `Không tìm thấy đường dẫn: ${req.originalUrl}` }); // báo rõ URL nào không có
};

// Middleware xử lý lỗi tập trung - Express nhận biết middleware lỗi nhờ ĐỦ 4 tham số (err, req, res, next)
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err.message); // ghi log lỗi ở server
  // Controller hay đặt res.status(400) rồi throw new Error(...) -> giữ mã đó; chưa đặt (vẫn 200) thì coi là lỗi hệ thống 500
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  // Lỗi có gắn sẵn err.statusCode hợp lệ (400..599) thì ưu tiên mã đó
  if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599) statusCode = err.statusCode;
  // Lỗi validate/ép kiểu dữ liệu của Mongoose là lỗi do dữ liệu đầu vào, không phải lỗi hệ thống
  if (err.name === 'ValidationError' || err.name === 'CastError') statusCode = 400; // VD: id sai định dạng ObjectId
  res.status(statusCode).json({ // trả JSON cho frontend
    message: err.message || 'Lỗi hệ thống, vui lòng thử lại sau', // thông báo hiển thị cho người dùng
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack // chỉ lộ chi tiết lỗi khi lập trình (production thì ẩn)
  });
};

module.exports = { notFound, errorHandler }; // xuất cho app.js
