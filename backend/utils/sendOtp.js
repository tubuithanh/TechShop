const { sendMail } = require('./mailer');

// Gửi mã OTP qua email (cách gửi do utils/mailer.js chọn theo cấu hình; chưa cấu hình thì chỉ in ra log).
const PURPOSE_LABEL = { register: 'xác thực đăng ký tài khoản', reset_password: 'đặt lại mật khẩu' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function sendOtp(destination, code, purpose, { expiresMinutes = 5, shopName = 'TechShop' } = {}) {
  const label = PURPOSE_LABEL[purpose] || 'xác thực';
  const shop = escapeHtml(shopName);
  const subject = `${code} là mã ${label} ${shopName}`;
  const text = `Mã ${label} của bạn là: ${code}\nMã có hiệu lực trong ${expiresMinutes} phút. Không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên ${shopName}.\nNếu bạn không yêu cầu mã này, hãy bỏ qua email.`;
  const html = `<!doctype html>
<html lang="vi"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#d7261e;color:#ffffff;padding:18px 24px;font-size:20px;font-weight:bold">${shop}</td></tr>
        <tr><td style="padding:24px">
          <p style="margin:0 0 12px">Xin chào,</p>
          <p style="margin:0 0 16px">Mã ${escapeHtml(label)} của bạn là:</p>
          <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f4f5f7;border-radius:8px;padding:14px 0">${escapeHtml(code)}</p>
          <p style="margin:0 0 8px;font-size:14px">Mã có hiệu lực trong <strong>${expiresMinutes} phút</strong> và chỉ dùng được một lần.</p>
          <p style="margin:0;font-size:14px;color:#6b7280">Không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên ${shop}. Nếu bạn không yêu cầu mã, hãy bỏ qua email này.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return sendMail({ to: destination, subject, html, text });
}

module.exports = { sendOtp };
