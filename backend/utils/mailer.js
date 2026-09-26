const dns = require('dns').promises;
const net = require('net');
const nodemailer = require('nodemailer');
const MailConfig = require('../models/MailConfig');
const { decrypt } = require('./secretBox');
const { sendViaGmail } = require('./gmailApi');

// Gửi email. Cấu hình lấy theo thứ tự ưu tiên:
//   1. Cấu hình admin nhập trong "Cấu hình hệ thống > Cấu hình gửi email" (collection mail_configs)
//   2. Biến môi trường: RESEND_API_KEY (gửi qua HTTPS) hoặc SMTP_HOST/PORT/USER/PASS (xem .env.example)
//   3. Không có gì -> chế độ demo: chỉ in nội dung ra log máy chủ, không gửi thật
const DEFAULT_FROM = 'TechShop <no-reply@techshop.demo>';

function configFromEnv() {
  if (process.env.RESEND_API_KEY) {
    return { mode: 'resend', source: 'env', apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM || DEFAULT_FROM };
  }
  if (process.env.SMTP_HOST) {
    return {
      mode: 'smtp',
      source: 'env',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.MAIL_FROM || process.env.SMTP_USER || DEFAULT_FROM
    };
  }
  return { mode: 'demo', source: 'env' };
}

// Chuyển bản ghi admin (đã mã hóa) thành cấu hình dùng được; null = không dùng (rơi về biến môi trường)
function configFromDoc(doc) {
  if (!doc || doc.provider === 'env') return null;
  if (doc.provider === 'off') return { mode: 'demo', source: 'admin' };
  if (doc.provider === 'gmail') {
    const email = doc.gmailEmail;
    // Gmail luôn gửi từ đúng tài khoản đã kết nối - chỉ giữ phần tên hiển thị của ô "Người gửi"
    const displayName = (String(doc.from || '').match(/^([^<]+)</)?.[1] || 'TechShop').trim();
    return {
      mode: 'gmail',
      source: 'admin',
      clientId: doc.gmailClientId,
      clientSecret: decrypt(doc.gmailClientSecretEnc),
      refreshToken: decrypt(doc.gmailRefreshTokenEnc),
      email,
      from: email ? `${displayName} <${email}>` : doc.from || DEFAULT_FROM
    };
  }
  if (doc.provider === 'resend') {
    return { mode: 'resend', source: 'admin', apiKey: decrypt(doc.resendApiKeyEnc), from: doc.from || DEFAULT_FROM };
  }
  return {
    mode: 'smtp',
    source: 'admin',
    host: doc.smtpHost,
    port: Number(doc.smtpPort || 587),
    user: doc.smtpUser,
    pass: decrypt(doc.smtpPasswordEnc),
    from: doc.from || doc.smtpUser || DEFAULT_FROM
  };
}

// Đọc cấu hình từ database có bộ nhớ đệm ngắn (không truy vấn DB ở mỗi email); lưu cấu hình mới thì xóa đệm
let cache = { at: 0, config: null };
const CACHE_MS = 30 * 1000;
function clearMailConfigCache() {
  cache = { at: 0, config: null };
}
async function resolveMailConfig() {
  if (cache.config && Date.now() - cache.at < CACHE_MS) return cache.config;
  let doc = null;
  try {
    doc = await MailConfig.findOne().lean();
  } catch {
    doc = null; // chưa kết nối DB (VD script chạy riêng) -> dùng biến môi trường
  }
  const config = configFromDoc(doc) || configFromEnv();
  cache = { at: Date.now(), config };
  return config;
}

async function isMailConfigured() {
  return (await resolveMailConfig()).mode !== 'demo';
}

// Nhiều máy chủ web (VD Render) không có đường mạng IPv6, nhưng smtp.gmail.com có cả địa chỉ IPv6 -> nếu
// kết nối theo IPv6 sẽ lỗi "connect ENETUNREACH 2607:f8b0:...". Vì vậy tự tra địa chỉ IPv4 và kết nối bằng
// IPv4, nhưng vẫn kiểm tra chứng chỉ TLS theo đúng tên máy chủ (servername). Không tra được IPv4 thì dùng tên gốc.
async function resolveIPv4(host) {
  if (net.isIP(host)) return host;
  try {
    return (await dns.lookup(host, { family: 4 })).address;
  } catch {
    return host;
  }
}

async function createTransport(c) {
  const address = await resolveIPv4(c.host);
  return nodemailer.createTransport({
    host: address,
    port: c.port,
    tls: { servername: c.host },
    secure: c.port === 465, // 465: SSL ngay từ đầu; 587: STARTTLS
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

// Gửi 1 email bằng cấu hình chỉ định. Ném lỗi nếu thất bại (để nơi gọi báo lỗi thay vì im lặng).
async function sendWithConfig(c, { to, subject, html, text }) {
  if (c.mode === 'demo') {
    console.log(`[MAIL DEMO] Tới: ${to} | Tiêu đề: ${subject}\n${text || ''}`);
    return { mode: c.mode };
  }
  if (c.mode === 'gmail') {
    if (!c.clientId || !c.clientSecret) throw new Error('Thiếu Client ID / Client Secret của Gmail API (hoặc không giải mã được - hãy nhập lại)');
    if (!c.refreshToken) throw new Error('Chưa kết nối tài khoản Gmail - bấm "Kết nối tài khoản Gmail"');
    await sendViaGmail(c, { to, subject, html, text });
    return { mode: c.mode };
  }
  if (c.mode === 'resend') {
    if (!c.apiKey) throw new Error('Thiếu API key Resend (hoặc không giải mã được key đã lưu - hãy nhập lại)');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.from, to: [to], subject, html, text })
    });
    if (!res.ok) throw new Error(`Resend lỗi ${res.status}: ${await res.text()}`);
    return { mode: c.mode };
  }
  if (!c.host) throw new Error('Thiếu máy chủ SMTP');
  if (c.user && !c.pass) throw new Error('Thiếu mật khẩu SMTP (hoặc không giải mã được mật khẩu đã lưu - hãy nhập lại)');
  const info = await (await createTransport(c)).sendMail({ from: c.from, to, subject, html, text });
  return { mode: c.mode, info };
}

async function sendMail(mail) {
  return sendWithConfig(await resolveMailConfig(), mail);
}

// Kiểm tra kết nối/đăng nhập SMTP (script kiểm tra cấu hình)
async function verifyMailConfig() {
  const c = await resolveMailConfig();
  if (c.mode === 'smtp') await (await createTransport(c)).verify();
  return c.mode;
}

module.exports = {
  sendMail,
  sendWithConfig,
  resolveMailConfig,
  configFromDoc,
  configFromEnv,
  clearMailConfigCache,
  isMailConfigured,
  verifyMailConfig
};
