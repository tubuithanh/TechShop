const MailComposer = require('nodemailer/lib/mail-composer');

// Gửi email qua Gmail API (REST, HTTPS cổng 443) bằng OAuth2 - dùng khi máy chủ web chặn cổng SMTP mà vẫn
// muốn gửi từ chính địa chỉ @gmail.com. Không cần thư viện googleapis: chỉ gọi 2 API
//   - https://oauth2.googleapis.com/token        : đổi refresh token lấy access token (sống ~1 giờ)
//   - gmail/v1/users/me/messages/send            : gửi thư dạng MIME (base64url)
// Quyền (scope) xin khi kết nối: chỉ gửi thư + đọc địa chỉ email, KHÔNG đọc được hộp thư.
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

// Đệm access token theo refresh token (không xin token mới cho mỗi email)
const tokenCache = new Map();

async function googleError(res) {
  const body = await res.text();
  let detail = body;
  try {
    const j = JSON.parse(body);
    // Giữ cả mã lỗi (VD "invalid_grant") lẫn mô tả - mã lỗi dùng để diễn giải cho admin (friendlyError)
    detail = typeof j.error === 'string' ? [j.error, j.error_description].filter(Boolean).join(': ') : j.error?.message || body;
  } catch {
    /* giữ nguyên nội dung */
  }
  const err = new Error(`Google lỗi ${res.status}: ${String(detail).slice(0, 300)}`);
  err.status = res.status;
  err.googleError = typeof detail === 'string' ? detail : '';
  return err;
}

function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline', // để nhận refresh token dùng lâu dài
    prompt: 'consent', // luôn cấp lại refresh token (kể cả khi đã từng cấp quyền)
    include_granted_scopes: 'true',
    state
  });
  return `${AUTH_URL}?${params}`;
}

// Đổi mã (code) Google trả về sau khi admin đồng ý -> refresh token + địa chỉ email
async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  });
  if (!res.ok) throw await googleError(res);
  const tokens = await res.json();
  if (!tokens.refresh_token) throw new Error('Google không trả về refresh token - hãy thử kết nối lại');
  const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!info.ok) throw await googleError(info);
  const { email } = await info.json();
  return { refreshToken: tokens.refresh_token, email };
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60 * 1000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  if (!res.ok) throw await googleError(res);
  const data = await res.json();
  tokenCache.set(refreshToken, { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 });
  return data.access_token;
}

function buildRawMessage(mail) {
  return new Promise((resolve, reject) => {
    new MailComposer(mail).compile().build((err, message) => (err ? reject(err) : resolve(message.toString('base64url'))));
  });
}

// Gửi 1 email. Gmail luôn gửi từ chính tài khoản đã kết nối (from khác sẽ bị Gmail thay bằng địa chỉ đó).
async function sendViaGmail(c, { to, subject, html, text }) {
  const token = await getAccessToken(c);
  const raw = await buildRawMessage({ from: c.from, to, subject, html, text });
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  if (!res.ok) throw await googleError(res);
  return res.json();
}

module.exports = { GMAIL_SCOPES, buildAuthUrl, exchangeCode, getAccessToken, sendViaGmail, buildRawMessage };
