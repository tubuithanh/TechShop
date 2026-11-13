// CỔNG THANH TOÁN GIẢ LẬP cho VNPay / MoMo - dùng khi cổng thật lỗi / chưa có tài khoản sandbox, để kiểm thử và
// demo trọn luồng thanh toán + hoàn tiền mà không trừ tiền thật.
// Admin bật ở Cấu hình hệ thống -> Thanh toán -> chọn cổng -> "Giả lập (demo)".
//
// Hoạt động giống cổng thật: tạo link -> trang thanh toán (do TechShop phục vụ) -> khách bấm Thành công / Thất bại ->
// kết quả được KÝ đúng thuật toán của cổng (VNPay HMAC-SHA512, MoMo HMAC-SHA256) rồi đi qua đúng code xác minh chữ ký
// và ghi nhận thanh toán thật của TechShop (verifyReturn / verifyResult -> applyResult).
// Khóa ký sinh từ bí mật của máy chủ (JWT_ACCESS_SECRET) nên người ngoài không tự tạo được kết quả "đã thanh toán".
const crypto = require('crypto');

const SIM = {
  vnpayTmnCode: 'SIMVNPAY',
  momoPartnerCode: 'SIMMOMO',
  momoAccessKey: 'SIMACCESS'
};

function simSecret(kind) {
  const base = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'techshop-dev-secret';
  return crypto.createHmac('sha256', base).update(`payment-simulator:${kind}`).digest('hex').slice(0, 32);
}

// Cấu hình "giả lập" có cùng hình dạng với cấu hình thật của từng cổng
const vnpayConfig = (returnUrl) => ({
  source: 'simulator', tmnCode: SIM.vnpayTmnCode, hashSecret: simSecret('vnpay'), url: 'simulator', returnUrl
});
const momoConfig = (redirectUrl) => ({
  source: 'simulator', partnerCode: SIM.momoPartnerCode, accessKey: SIM.momoAccessKey, secretKey: simSecret('momo'),
  endpoint: 'simulator', redirectUrl, ipnUrl: ''
});

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

// Trang thanh toán giả (HTML thuần, không cần frontend). action: địa chỉ POST khi bấm nút; hidden: các trường gửi kèm.
function renderPage({ gateway, color, amount, orderInfo, txnRef, action, hidden }) {
  const inputs = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(gateway)} - Thanh toán giả lập</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f3f4f6;color:#111827}
  .wrap{max-width:440px;margin:40px auto;padding:0 16px}
  .warn{background:#fef3c7;border:1px solid #f59e0b;color:#92400e;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:16px}
  .card{background:#fff;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.08);overflow:hidden}
  .head{background:${color};color:#fff;padding:18px 20px;font-weight:700;font-size:18px}
  .body{padding:20px}
  .row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}
  .row span:first-child{color:#6b7280}
  .amount{font-size:28px;font-weight:800;text-align:center;margin:18px 0 6px}
  .btns{display:flex;flex-direction:column;gap:10px;margin-top:18px}
  button{border:0;border-radius:10px;padding:13px;font-size:15px;font-weight:600;cursor:pointer}
  .ok{background:#16a34a;color:#fff} .fail{background:#fff;color:#dc2626;border:1px solid #fca5a5}
  .note{font-size:12px;color:#6b7280;text-align:center;margin-top:14px}
</style></head>
<body><div class="wrap">
  <div class="warn"><b>MÔI TRƯỜNG GIẢ LẬP</b> - dùng để kiểm thử / demo. Không kết nối ${esc(gateway)} thật, không trừ tiền.</div>
  <div class="card">
    <div class="head">${esc(gateway)} · Cổng thanh toán giả lập</div>
    <div class="body">
      <div class="amount">${esc(vnd(amount))}</div>
      <div class="row"><span>Nội dung</span><span>${esc(orderInfo)}</span></div>
      <div class="row"><span>Mã giao dịch</span><span>${esc(txnRef)}</span></div>
      <div class="btns">
        <form method="post" action="${esc(action)}">${inputs}<input type="hidden" name="result" value="success"><button class="ok" type="submit" style="width:100%">Thanh toán thành công</button></form>
        <form method="post" action="${esc(action)}">${inputs}<input type="hidden" name="result" value="fail"><button class="fail" type="submit" style="width:100%">Thanh toán thất bại / Hủy</button></form>
      </div>
      <div class="note">Kết quả được ký như ${esc(gateway)} thật và xử lý bởi đúng luồng ghi nhận thanh toán của TechShop.</div>
    </div>
  </div>
</div></body></html>`;
}

const randomDigits = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

module.exports = { SIM, simSecret, vnpayConfig, momoConfig, renderPage, randomDigits };
