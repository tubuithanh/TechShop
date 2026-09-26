const MailConfig = require('../models/MailConfig');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt, decrypt, keySource, signPayload, verifyPayload } = require('../utils/secretBox');
const { buildAuthUrl, exchangeCode } = require('../utils/gmailApi');
const { configFromDoc, configFromEnv, sendWithConfig, clearMailConfigCache } = require('../utils/mailer');

const PROVIDERS = ['env', 'smtp', 'resend', 'gmail', 'off'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// "Tên <email>" hoặc chỉ "email"
const FROM_RE = /^(?:[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

// Dữ liệu trả về trình duyệt: KHÔNG kèm mật khẩu/API key, chỉ cho biết đã lưu hay chưa
// Địa chỉ Google chuyển về sau khi admin cấp quyền - phải khai báo ĐÚNG địa chỉ này trong Google Cloud Console
function gmailRedirectUri(req) {
  if (process.env.GMAIL_REDIRECT_URI) return process.env.GMAIL_REDIRECT_URI;
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/settings/mail/gmail/callback`;
}

function publicView(doc, req) {
  const d = doc || {};
  return {
    gmailClientId: d.gmailClientId || '',
    hasGmailClientSecret: Boolean(d.gmailClientSecretEnc),
    gmailConnected: Boolean(d.gmailRefreshTokenEnc),
    gmailEmail: d.gmailEmail || '',
    gmailRedirectUri: req ? gmailRedirectUri(req) : '',
    provider: d.provider || 'env',
    smtpHost: d.smtpHost || '',
    smtpPort: d.smtpPort || 587,
    smtpUser: d.smtpUser || '',
    from: d.from || '',
    hasSmtpPassword: Boolean(d.smtpPasswordEnc),
    hasResendApiKey: Boolean(d.resendApiKeyEnc),
    // Bí mật đã lưu nhưng không giải mã được (khóa mã hóa trên máy chủ đã đổi) -> admin cần nhập lại
    secretUnreadable: ['smtpPasswordEnc', 'resendApiKeyEnc', 'gmailClientSecretEnc', 'gmailRefreshTokenEnc'].some((k) => d[k] && !decrypt(d[k])),
    envMode: configFromEnv().mode, // cách gửi nếu chọn "dùng biến môi trường"
    encryptionKey: keySource(), // SETTINGS_SECRET | JWT_ACCESS_SECRET | null
    updatedAt: d.updatedAt || null
  };
}

// Kiểm tra dữ liệu gửi lên; trả về { error } hoặc { values } (values.smtpPassword/resendApiKey rỗng = giữ cũ)
function parseBody(body) {
  const provider = PROVIDERS.includes(body.provider) ? body.provider : null;
  if (!provider) return { error: 'Cách gửi email không hợp lệ' };
  const values = {
    provider,
    smtpHost: String(body.smtpHost || '').trim(),
    smtpPort: Number(body.smtpPort || 587),
    smtpUser: String(body.smtpUser || '').trim(),
    smtpPassword: typeof body.smtpPassword === 'string' ? body.smtpPassword : '',
    resendApiKey: typeof body.resendApiKey === 'string' ? body.resendApiKey.trim() : '',
    gmailClientId: String(body.gmailClientId || '').trim(),
    gmailClientSecret: typeof body.gmailClientSecret === 'string' ? body.gmailClientSecret.trim() : '',
    from: String(body.from || '').trim()
  };
  if (values.from && !FROM_RE.test(values.from)) return { error: 'Người gửi phải có dạng "Tên <email@domain.com>" hoặc một địa chỉ email' };
  if (provider === 'gmail' && values.gmailClientId && !/\.apps\.googleusercontent\.com$/.test(values.gmailClientId)) {
    return { error: 'Client ID không hợp lệ (phải kết thúc bằng .apps.googleusercontent.com)' };
  }
  if (provider === 'smtp') {
    if (!values.smtpHost) return { error: 'Vui lòng nhập máy chủ SMTP' };
    if (!/^[a-z0-9.-]+$/i.test(values.smtpHost)) return { error: 'Máy chủ SMTP không hợp lệ' };
    if (!Number.isInteger(values.smtpPort) || values.smtpPort < 1 || values.smtpPort > 65535) return { error: 'Cổng SMTP phải từ 1 đến 65535' };
  }
  return { values };
}

// Ghép giá trị mới với bản ghi cũ thành bản ghi (dạng đã mã hóa) - để trống bí mật thì giữ bí mật cũ
function mergeDoc(existing, v) {
  // Refresh token gắn với đúng OAuth client đã cấp - đổi Client ID thì phải kết nối lại tài khoản Gmail
  const sameClient = (existing?.gmailClientId || '') === v.gmailClientId;
  return {
    gmailClientId: v.gmailClientId,
    gmailClientSecretEnc: v.gmailClientSecret ? encrypt(v.gmailClientSecret) : existing?.gmailClientSecretEnc || '',
    gmailRefreshTokenEnc: sameClient ? existing?.gmailRefreshTokenEnc || '' : '',
    gmailEmail: sameClient ? existing?.gmailEmail || '' : '',
    provider: v.provider,
    smtpHost: v.smtpHost,
    smtpPort: v.smtpPort,
    smtpUser: v.smtpUser,
    from: v.from,
    smtpPasswordEnc: v.smtpPassword ? encrypt(v.smtpPassword) : existing?.smtpPasswordEnc || '',
    resendApiKeyEnc: v.resendApiKey ? encrypt(v.resendApiKey) : existing?.resendApiKeyEnc || ''
  };
}

// @route GET /api/settings/mail - chỉ admin
const getMailConfig = asyncHandler(async (req, res) => {
  res.json({ data: publicView(await MailConfig.findOne().lean(), req) });
});

// @route PUT /api/settings/mail - chỉ admin
const updateMailConfig = asyncHandler(async (req, res) => {
  const { values, error } = parseBody(req.body || {});
  if (error) return res.status(400).json({ message: error });
  const existing = await MailConfig.findOne();
  const merged = mergeDoc(existing, values);
  if (values.provider === 'smtp' && merged.smtpHost && values.smtpUser && !merged.smtpPasswordEnc) {
    return res.status(400).json({ message: 'Vui lòng nhập mật khẩu SMTP' });
  }
  if (values.provider === 'resend' && !merged.resendApiKeyEnc) return res.status(400).json({ message: 'Vui lòng nhập API key Resend' });
  if (values.provider === 'gmail' && (!merged.gmailClientId || !merged.gmailClientSecretEnc)) {
    return res.status(400).json({ message: 'Vui lòng nhập Client ID và Client Secret của Gmail API' });
  }

  const doc = existing || new MailConfig();
  Object.assign(doc, merged, { updatedBy: req.account._id });
  await doc.save();
  clearMailConfigCache();
  res.json({ data: publicView(doc.toObject(), req), message: 'Đã lưu cấu hình email' });
});

// @route POST /api/settings/mail/test - chỉ admin. Gửi email thử bằng cấu hình ĐANG NHẬP (chưa cần lưu),
// để admin biết cấu hình đúng hay sai trước khi áp dụng cho khách.
const testMailConfig = asyncHandler(async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!EMAIL_RE.test(to)) return res.status(400).json({ message: 'Email nhận thử không hợp lệ' });
  const { values, error } = parseBody(req.body || {});
  if (error) return res.status(400).json({ message: error });

  const existing = await MailConfig.findOne().lean();
  const config = configFromDoc(mergeDoc(existing, values)) || configFromEnv();
  if (config.mode === 'demo') {
    return res.status(400).json({ message: 'Đang ở chế độ demo (chưa cấu hình cách gửi) nên không gửi email thật' });
  }
  try {
    await sendWithConfig(config, {
      to,
      subject: 'Email thử cấu hình - TechShop',
      text: 'Cấu hình gửi email của TechShop hoạt động bình thường.',
      html: '<p>Cấu hình gửi email của <strong>TechShop</strong> hoạt động bình thường.</p>'
    });
  } catch (err) {
    return res.status(502).json({ message: `Gửi thử thất bại: ${friendlyError(err)}` });
  }
  const label = { smtp: 'SMTP', resend: 'Resend', gmail: 'Gmail API' }[config.mode];
  res.json({ message: `Đã gửi email thử tới ${to} (${label}). Hãy kiểm tra hộp thư, cả mục Spam.` });
});

// ---------- Gmail API: kết nối tài khoản (OAuth2) ----------

// @route POST /api/settings/mail/gmail/connect - chỉ admin. Dùng Client ID/Secret ĐÃ LƯU, trả về link đăng nhập
// Google; "state" được ký (HMAC) kèm id admin + redirect URI và hết hạn sau 10 phút để chống giả mạo.
const startGmailConnect = asyncHandler(async (req, res) => {
  const doc = await MailConfig.findOne().lean();
  if (!doc?.gmailClientId || !decrypt(doc.gmailClientSecretEnc)) {
    return res.status(400).json({ message: 'Hãy nhập và LƯU Client ID, Client Secret trước khi kết nối tài khoản Gmail' });
  }
  const redirectUri = gmailRedirectUri(req);
  const state = signPayload({ a: String(req.account._id), r: redirectUri });
  res.json({ data: { url: buildAuthUrl({ clientId: doc.gmailClientId, redirectUri, state }) } });
});

// @route GET /api/settings/mail/gmail/callback - Google chuyển trình duyệt admin về đây (không có token đăng
// nhập của web -> xác thực bằng "state" đã ký). Lưu refresh token (mã hóa) rồi quay về trang Cấu hình.
const gmailCallback = asyncHandler(async (req, res) => {
  const back = (params) =>
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/settings?${new URLSearchParams({ tab: 'email', ...params })}`);
  const state = verifyPayload(req.query.state, 10 * 60 * 1000);
  if (!state) return back({ gmail: 'error', reason: 'Phiên kết nối không hợp lệ hoặc đã hết hạn, vui lòng thử lại' });
  if (req.query.error) {
    return back({ gmail: 'error', reason: req.query.error === 'access_denied' ? 'Bạn đã từ chối cấp quyền gửi email' : String(req.query.error) });
  }
  const doc = await MailConfig.findOne();
  const clientSecret = decrypt(doc?.gmailClientSecretEnc);
  if (!doc?.gmailClientId || !clientSecret) return back({ gmail: 'error', reason: 'Chưa lưu Client ID / Client Secret' });
  try {
    const { refreshToken, email } = await exchangeCode({
      clientId: doc.gmailClientId,
      clientSecret,
      redirectUri: state.r,
      code: String(req.query.code || '')
    });
    doc.gmailRefreshTokenEnc = encrypt(refreshToken);
    doc.gmailEmail = email || '';
    doc.updatedBy = state.a;
    await doc.save();
    clearMailConfigCache();
    return back({ gmail: 'connected' });
  } catch (err) {
    return back({ gmail: 'error', reason: friendlyError(err) });
  }
});

// @route POST /api/settings/mail/gmail/disconnect - chỉ admin. Xóa refresh token và thu hồi quyền bên Google.
const disconnectGmail = asyncHandler(async (req, res) => {
  const doc = await MailConfig.findOne();
  const token = decrypt(doc?.gmailRefreshTokenEnc);
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  }
  if (doc) {
    doc.gmailRefreshTokenEnc = '';
    doc.gmailEmail = '';
    await doc.save();
  }
  clearMailConfigCache();
  res.json({ data: publicView(doc?.toObject(), req), message: 'Đã ngắt kết nối tài khoản Gmail' });
});

// Diễn giải lỗi thường gặp cho admin dễ hiểu
function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/invalid_grant/i.test(msg)) {
    return 'quyền truy cập Gmail đã hết hạn hoặc bị thu hồi - bấm "Kết nối tài khoản Gmail" lại (nếu ứng dụng Google đang ở chế độ Testing, quyền chỉ có hiệu lực 7 ngày)';
  }
  if (/invalid_client|unauthorized_client/i.test(msg)) return 'Client ID hoặc Client Secret không đúng';
  if (/redirect_uri_mismatch/i.test(msg)) return 'Redirect URI chưa khai báo đúng trong Google Cloud Console';
  if (/Gmail API has not been used|accessNotConfigured|SERVICE_DISABLED/i.test(msg)) return 'chưa bật Gmail API cho project trong Google Cloud Console';
  if (/Invalid login|535|Username and Password not accepted|EAUTH/i.test(msg)) {
    return 'sai tài khoản hoặc mật khẩu SMTP (Gmail cần "Mật khẩu ứng dụng", không dùng mật khẩu đăng nhập)';
  }
  if (/ENETUNREACH|EHOSTUNREACH/i.test(msg)) {
    return 'máy chủ web không có đường mạng tới máy chủ SMTP (thường do IPv6) - thử cổng 465, hoặc dùng Resend';
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout|ECONNRESET/i.test(msg)) {
    return 'không kết nối được máy chủ SMTP (sai địa chỉ/cổng, hoặc máy chủ web chặn cổng SMTP - thử cổng khác hoặc dùng Resend)';
  }
  return msg.slice(0, 300);
}

module.exports = { getMailConfig, updateMailConfig, testMailConfig, startGmailConnect, gmailCallback, disconnectGmail };
