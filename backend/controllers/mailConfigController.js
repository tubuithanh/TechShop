const MailConfig = require('../models/MailConfig');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt, decrypt, keySource } = require('../utils/secretBox');
const { configFromDoc, configFromEnv, sendWithConfig, clearMailConfigCache } = require('../utils/mailer');

const PROVIDERS = ['env', 'smtp', 'resend', 'off'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// "Tên <email>" hoặc chỉ "email"
const FROM_RE = /^(?:[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

// Dữ liệu trả về trình duyệt: KHÔNG kèm mật khẩu/API key, chỉ cho biết đã lưu hay chưa
function publicView(doc) {
  const d = doc || {};
  return {
    provider: d.provider || 'env',
    smtpHost: d.smtpHost || '',
    smtpPort: d.smtpPort || 587,
    smtpUser: d.smtpUser || '',
    from: d.from || '',
    hasSmtpPassword: Boolean(d.smtpPasswordEnc),
    hasResendApiKey: Boolean(d.resendApiKeyEnc),
    // Bí mật đã lưu nhưng không giải mã được (khóa mã hóa trên máy chủ đã đổi) -> admin cần nhập lại
    secretUnreadable: Boolean((d.smtpPasswordEnc && !decrypt(d.smtpPasswordEnc)) || (d.resendApiKeyEnc && !decrypt(d.resendApiKeyEnc))),
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
    from: String(body.from || '').trim()
  };
  if (values.from && !FROM_RE.test(values.from)) return { error: 'Người gửi phải có dạng "Tên <email@domain.com>" hoặc một địa chỉ email' };
  if (provider === 'smtp') {
    if (!values.smtpHost) return { error: 'Vui lòng nhập máy chủ SMTP' };
    if (!/^[a-z0-9.-]+$/i.test(values.smtpHost)) return { error: 'Máy chủ SMTP không hợp lệ' };
    if (!Number.isInteger(values.smtpPort) || values.smtpPort < 1 || values.smtpPort > 65535) return { error: 'Cổng SMTP phải từ 1 đến 65535' };
  }
  return { values };
}

// Ghép giá trị mới với bản ghi cũ thành bản ghi (dạng đã mã hóa) - để trống bí mật thì giữ bí mật cũ
function mergeDoc(existing, v) {
  return {
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
  res.json({ data: publicView(await MailConfig.findOne().lean()) });
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

  const doc = existing || new MailConfig();
  Object.assign(doc, merged, { updatedBy: req.account._id });
  await doc.save();
  clearMailConfigCache();
  res.json({ data: publicView(doc.toObject()), message: 'Đã lưu cấu hình email' });
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
  res.json({ message: `Đã gửi email thử tới ${to} (${config.mode === 'smtp' ? 'SMTP' : 'Resend'}). Hãy kiểm tra hộp thư, cả mục Spam.` });
});

// Diễn giải lỗi thường gặp cho admin dễ hiểu
function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/Invalid login|535|Username and Password not accepted|EAUTH/i.test(msg)) {
    return 'sai tài khoản hoặc mật khẩu SMTP (Gmail cần "Mật khẩu ứng dụng", không dùng mật khẩu đăng nhập)';
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout|ECONNRESET/i.test(msg)) {
    return 'không kết nối được máy chủ SMTP (sai địa chỉ/cổng, hoặc máy chủ web chặn cổng SMTP - thử cổng khác hoặc dùng Resend)';
  }
  return msg.slice(0, 300);
}

module.exports = { getMailConfig, updateMailConfig, testMailConfig };
