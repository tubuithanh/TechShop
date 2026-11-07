const mongoose = require('mongoose');

// Chạy nhiều thao tác ghi như 1 khối "tất cả hoặc không có gì" bằng transaction của MongoDB.
//
// Transaction cần MongoDB chạy dạng replica set (MongoDB Atlas luôn là replica set). MongoDB cài đơn lẻ trên
// máy lập trình không hỗ trợ -> fn(null): các thao tác vẫn chạy và nơi gọi tự hoàn tác thủ công khi lỗi
// (cách làm trước đây). Đặt MONGO_TRANSACTIONS=off để ép chạy không transaction (dùng trong test).
//
// fn(session) có thể bị chạy lại nhiều lần khi MongoDB báo xung đột tạm thời (VD 2 đơn cùng trừ 1 dòng tồn
// kho): mọi thao tác ghi trong lần chạy hỏng đã được hủy, nên fn không được làm việc "ra ngoài" như gửi email,
// tạo thông báo hay đẩy Socket.IO - những việc đó làm SAU khi withTransaction trả kết quả.
let supported = null;

async function transactionsSupported() {
  if (process.env.MONGO_TRANSACTIONS === 'off') return false;
  if (supported === null) {
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      supported = Boolean(hello.setName || hello.msg === 'isdbgrid');
    } catch {
      supported = false;
    }
  }
  return supported;
}

async function withTransaction(fn) {
  if (!(await transactionsSupported())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// Lỗi nghiệp vụ trả về cho người dùng (mã HTTP + thông báo), dùng để dừng transaction giữa chừng
class BusinessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { withTransaction, transactionsSupported, BusinessError };
