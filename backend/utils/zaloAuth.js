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

// code_verifier phải giữ BÍ MẬT ở phía backend (đó là ý nghĩa của PKCE); "state" là chuỗi ngẫu nhiên riêng
// để đối chiếu khi Zalo gọi lại (chống giả mạo yêu cầu). Trước đây code_verifier được gửi luôn trong "state"
// (đi qua URL, lịch sử trình duyệt) và không có bước đối chiếu. Hàm trả về cả 2 giá trị để controller cất vào
// cookie httpOnly có chữ ký (backend không dùng session).
function buildAuthUrl({ appId, redirectUri }) {
  const codeVerifier = generateCodeVerifier();
  const state = base64url(crypto.randomBytes(16));
  const url = new URL(AUTH_URL);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', generateCodeChallenge(codeVerifier));
  url.searchParams.set('state', state);
  return { url: url.toString(), state, codeVerifier };
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
  if (data.id) return data;

  // Zalo chặn trả về tên/ảnh đại diện (thông tin cá nhân) nếu server gọi API không có IP tại Việt
  // Nam (VD: backend triển khai trên Render ở nước ngoài) - báo lỗi "Personal information is
  // limited...". "id" (định danh, không phải thông tin cá nhân) thường vẫn lấy được riêng lẻ, nên
  // thử lại chỉ với "id" để đăng nhập vẫn hoạt động (tên hiển thị sẽ dùng mặc định "Người dùng Zalo").
  const idOnlyUrl = new URL(PROFILE_URL);
  idOnlyUrl.searchParams.set('fields', 'id');
  const idOnlyRes = await fetch(idOnlyUrl.toString(), { headers: { access_token: accessToken } });
  const idOnlyData = await idOnlyRes.json();
  if (idOnlyData.id) return idOnlyData;

  throw new Error(data.message || idOnlyData.message || 'Không lấy được thông tin người dùng từ Zalo');
}

module.exports = { buildAuthUrl, exchangeCodeForToken, fetchZaloProfile };
