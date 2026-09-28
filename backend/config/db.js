const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/ecommerce_multistore_db';

// Chọn chuỗi kết nối MongoDB:
// - Có MONGO_URI (Render -> Environment, hoặc backend/.env ở máy lập trình) -> dùng nó
// - Production mà thiếu MONGO_URI -> dừng ngay với thông báo rõ ràng, KHÔNG tự trỏ về MongoDB local
//   (trước đây thiếu biến này thì server lặng lẽ thử kết nối 127.0.0.1 rồi báo lỗi khó hiểu)
// - Máy lập trình mà thiếu MONGO_URI -> dùng MongoDB trên máy
function resolveMongoUri(env = process.env) {
  const uri = String(env.MONGO_URI || '').trim();
  if (uri) return uri;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Chưa cấu hình MONGO_URI. Trên Render: vào service backend -> Environment -> thêm biến MONGO_URI = chuỗi kết nối MongoDB Atlas.'
    );
  }
  return LOCAL_URI;
}

// Ẩn mật khẩu khi in chuỗi kết nối ra log: mongodb+srv://user:****@host/db
const maskUri = (uri) => uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@');

async function connectDB() {
  try {
    const uri = resolveMongoUri();
    await mongoose.connect(uri);
    console.log(`[DB] Đã kết nối MongoDB: ${maskUri(uri).replace(/\?.*$/, '')}`);
  } catch (err) {
    console.error('[DB] Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
module.exports.resolveMongoUri = resolveMongoUri;
module.exports.maskUri = maskUri;
