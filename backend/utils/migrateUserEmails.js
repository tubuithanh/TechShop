const User = require('../models/User');

// Chuyển đổi dữ liệu 1 lần (chạy mỗi lần khởi động, lần sau không còn gì để làm):
// 1. Chỉ số cũ "email_1" (unique, bắt buộc mọi tài khoản có email) -> bỏ, thay bằng chỉ số chỉ áp dụng cho tài
//    khoản CÓ email (khai báo trong models/User.js). Phải bỏ chỉ số cũ TRƯỚC khi xóa email tạm, nếu không nhiều
//    tài khoản trống email bị coi là trùng nhau.
// 2. Tài khoản Zalo tạo trước đây có email tạm zalo<id>@zalo.techshop.local -> xóa email (để trống); ID Zalo
//    vẫn nằm ở trường zaloId nên đăng nhập bằng Zalo không bị ảnh hưởng.
// Trả về { droppedOldIndex, clearedPlaceholders }.
async function migrateUserEmails() {
  let droppedOldIndex = false;
  const indexes = await User.collection.indexes().catch(() => []);
  const old = indexes.find((i) => i.name === 'email_1');
  if (old && !old.partialFilterExpression) {
    await User.collection.dropIndex('email_1');
    droppedOldIndex = true;
  }
  const { modifiedCount } = await User.collection.updateMany(
    { email: { $regex: `@${User.PLACEHOLDER_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`, $options: 'i' } },
    { $unset: { email: '' } }
  );
  await User.createIndexes(); // tạo chỉ số mới nếu chưa có
  return { droppedOldIndex, clearedPlaceholders: modifiedCount || 0 };
}

module.exports = { migrateUserEmails };
