const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecommerce_multistore_db';
    await mongoose.connect(uri);
    console.log('[DB] Đã kết nối MongoDB thành công');
  } catch (err) {
    console.error('[DB] Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
