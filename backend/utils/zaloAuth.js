const crypto = require('crypto');

// Đăng nhập bằng Zalo dùng OAuth 2.0 + PKCE (bắt buộc từ API v4 của Zalo).
// Tham khảo luồng chuẩn: https://developers.zalo.me/docs (Social API - Đăng nhập Zalo).
const AUTH_URL = 'https://oauth.zaloapp.com/v4/permission';
const TOKEN_URL = 'https://oauth.zaloapp.com/v4/access_token';
const PROFILE_URL = 'https://graph.zalo.me/v2.0/me';

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

// Backend không dùng session (chỉ JWT stateless) nên không thể lưu code_verifier giữa 2 request
// (bước xin quyền và bước callback) ở phía server. Thay vào đó, tận dụng tham số "state" - theo
// chuẩn OAuth2, Zalo LUÔN trả lại nguyên vẹn giá trị "state" ở bước callback - để mang chính
// code_verifier đi vòng qua trình duyệt người dùng và lấy lại ở bước sau, không cần lưu trạng thái.
function buildAuthUrl({ appId, redirectUri }) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const url = new URL(AUTH_URL);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('state', codeVerifier);
  return url.toString();
}

async function exchangeCodeForToken({ appId, appSecret, code, codeVerifier }) {
  const body = new URLSearchParams({
    code,
    app_id: appId,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: appSecret },
    body
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || data.error_reason || 'Không lấy được access token từ Zalo');
  }
  return data;
}

async function fetchZaloProfile(accessToken) {
  const url = new URL(PROFILE_URL);
  url.searchParams.set('fields', 'id,name,picture');
  const res = await fetch(url.toString(), { headers: { access_token: accessToken } });
  const data = await res.json();
  if (!data.id) {
    throw new Error(data.message || 'Không lấy được thông tin người dùng từ Zalo');
  }
  return data;
}

module.exports = { buildAuthUrl, exchangeCodeForToken, fetchZaloProfile };
