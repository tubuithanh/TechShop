// =====================================================================================================
// utils/generateTokens.js - TẠO TOKEN ĐĂNG NHẬP (JWT). Hệ thống dùng 2 loại token:
//   - Access token: sống NGẮN (mặc định 15 phút), gửi kèm mỗi request trong header Authorization: Bearer ...
//   - Refresh token: sống DÀI (mặc định 7 ngày), lưu trong cookie httpOnly (JavaScript trên trình duyệt
//     không đọc được -> chống đánh cắp qua XSS), chỉ dùng để xin access token mới khi cái cũ hết hạn.
// =====================================================================================================
const jwt = require('jsonwebtoken'); // thư viện ký / kiểm tra JWT

// user: { _id, role, tokenVersion } - tokenVersion để thu hồi token cũ khi đổi mật khẩu; role có thể là 'customer'
// (collection users) hoặc 'admin'/'staff' (collection admins)
function generateAccessToken(user) {
  return jwt.sign( // ký token bằng khóa bí mật -> ai sửa nội dung token thì chữ ký sai, server từ chối
    { id: user._id, role: user.role, tv: user.tokenVersion || 0 }, // nội dung (payload): mã tài khoản, vai trò, "phiên bản token"
    process.env.JWT_ACCESS_SECRET, // khóa ký access token (chỉ server biết)
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' } // thời hạn: cấu hình được, mặc định 15 phút
  );
}

function generateRefreshToken(user) {
  return jwt.sign( // ký refresh token
    { id: user._id, role: user.role, tv: user.tokenVersion || 0 }, // cùng nội dung; tv dùng để vô hiệu hóa khi đổi mật khẩu
    process.env.JWT_REFRESH_SECRET, // khóa ký RIÊNG cho refresh token (lộ khóa này không giả được access token và ngược lại)
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' } // thời hạn: mặc định 7 ngày
  );
}

module.exports = { generateAccessToken, generateRefreshToken }; // xuất 2 hàm cho authController dùng
