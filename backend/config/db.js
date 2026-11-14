// =====================================================================================================
// config/db.js - KẾT NỐI MONGODB bằng Mongoose (thư viện làm việc với MongoDB theo dạng model / schema).
// =====================================================================================================
const mongoose = require('mongoose'); // thư viện Mongoose

const LOCAL_URI = 'mongodb://127.0.0.1:27017/ecommerce_multistore_db'; // MongoDB cài trên máy lập trình (mặc định)

// Chọn chuỗi kết nối MongoDB:
// - Có MONGO_URI (Render -> Environment, hoặc backend/.env ở máy lập trình) -> dùng nó
// - Production mà thiếu MONGO_URI -> dừng ngay với thông báo rõ ràng, KHÔNG tự trỏ về MongoDB local
//   (trước đây thiếu biến này thì server lặng lẽ thử kết nối 127.0.0.1 rồi báo lỗi khó hiểu)
// - Máy lập trình mà thiếu MONGO_URI -> dùng MongoDB trên máy
function resolveMongoUri(env = process.env) { // env truyền vào được -> dễ viết test
  const uri = String(env.MONGO_URI || '').trim(); // lấy MONGO_URI, bỏ khoảng trắng thừa
  if (uri) return uri; // có cấu hình -> dùng luôn
  if (env.NODE_ENV === 'production') { // đang chạy production mà thiếu cấu hình
    throw new Error( // ném lỗi có hướng dẫn cách sửa
      'Chưa cấu hình MONGO_URI. Trên Render: vào service backend -> Environment -> thêm biến MONGO_URI = chuỗi kết nối MongoDB Atlas.'
    );
  }
  return LOCAL_URI; // máy lập trình: dùng MongoDB local
}

// Ẩn mật khẩu khi in chuỗi kết nối ra log: mongodb+srv://user:****@host/db
// Biểu thức chính quy: sau "//" bắt tên người dùng ($1), thay phần mật khẩu (sau ":" tới "@") bằng ****
const maskUri = (uri) => uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@');

async function connectDB() { // hàm kết nối, server.js gọi lúc khởi động
  try {
    const uri = resolveMongoUri(); // chọn chuỗi kết nối
    await mongoose.connect(uri); // kết nối (Mongoose tự quản lý nhóm kết nối - connection pool)
    console.log(`[DB] Đã kết nối MongoDB: ${maskUri(uri).replace(/\?.*$/, '')}`); // in chuỗi đã che mật khẩu, bỏ phần tham số sau "?"
  } catch (err) { // kết nối thất bại (sai địa chỉ, sai mật khẩu, MongoDB chưa chạy...)
    console.error('[DB] Lỗi kết nối MongoDB:', err.message); // in lý do
    process.exit(1); // thoát: không có DB thì server không thể hoạt động
  }
}

module.exports = connectDB; // xuất hàm kết nối (dùng: require('./config/db')())
module.exports.resolveMongoUri = resolveMongoUri; // xuất thêm để script seed và test dùng lại
module.exports.maskUri = maskUri; // xuất thêm để chỗ khác in chuỗi kết nối an toàn
