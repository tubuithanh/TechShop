/**
 * Kiểm tra cấu hình gửi email: gửi 1 email OTP thử tới địa chỉ chỉ định.
 * Chạy: node scripts/testEmail.js <email-nhận>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMailConfig, verifyMailConfig } = require('../utils/mailer');
const { sendOtp } = require('../utils/sendOtp');

(async () => {
  const to = process.argv[2];
  if (!to) {
    console.log('Cách dùng: node scripts/testEmail.js <email-nhận>');
    process.exit(1);
  }
  try {
    // Kết nối DB để đọc cấu hình admin đã lưu (Cấu hình hệ thống > Cấu hình gửi email); không có thì dùng biến môi trường
    if (process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI);
    const mode = await verifyMailConfig();
    console.log('Nguồn cấu hình:', (await resolveMailConfig()).source === 'admin' ? 'trang quản trị' : 'biến môi trường');
    console.log('Cách gửi đang dùng:', { smtp: 'SMTP', resend: 'Resend API', demo: 'DEMO (chưa cấu hình - chỉ in ra log)' }[mode]);
    await sendOtp(to, '123456', 'register');
    console.log(mode === 'demo' ? 'Chưa gửi thật - cấu hình trong Admin > Cấu hình hệ thống > Cấu hình gửi email, hoặc điền SMTP_*/RESEND_API_KEY trong .env' : `Đã gửi email thử tới ${to}, hãy kiểm tra hộp thư (cả mục Spam).`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Gửi email thất bại:', err.message);
    console.error('Kiểm tra lại SMTP_HOST/PORT/USER/PASS (Gmail cần "Mật khẩu ứng dụng", không dùng mật khẩu đăng nhập) hoặc RESEND_API_KEY / MAIL_FROM.');
    process.exit(1);
  }
})();
