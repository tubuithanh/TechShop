/**
 * Mô phỏng dịch vụ gửi OTP qua email/SMS.
 *
 * LƯU Ý CHO SINH VIÊN: đây là bản demo, chỉ in mã OTP ra console (log server)
 * thay vì gửi email/SMS thật, để đồ án chạy được ngay không cần tài khoản
 * dịch vụ bên thứ ba. Khi triển khai thật, thay hàm này bằng:
 *   - Nodemailer (gửi email thật, cần SMTP hoặc dịch vụ như Gmail/SendGrid)
 *   - Twilio / eSMS / Speed SMS (gửi SMS thật, cần tài khoản trả phí)
 *
 * Việc tách hàm gửi OTP thành 1 module riêng giúp sau này chỉ cần sửa
 * file này mà không phải sửa controller nào khác (nguyên tắc Single
 * Responsibility / dễ bảo trì).
 */
async function sendOtp(destination, code, purpose) {
  const purposeLabel = purpose === 'register' ? 'xác thực đăng ký' : 'đặt lại mật khẩu';
  console.log('==================================================');
  console.log(`[MOCK OTP SERVICE] Gửi mã ${purposeLabel} tới: ${destination}`);
  console.log(`[MOCK OTP SERVICE] Mã OTP: ${code} (hết hạn sau 5 phút)`);
  console.log('==================================================');
  // Trả về true để giả lập gửi thành công
  return true;
}

module.exports = { sendOtp };
