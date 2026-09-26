require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const MailConfig = require('../models/MailConfig');
const { clearMailConfigCache } = require('../utils/mailer');

const CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-bi-mat-cua-client';
const REFRESH = '1//refresh-token-rat-bi-mat';

async function adminAgent() {
  await Admin.create({ name: 'Admin', email: 'admin-gmail@example.com', password: 'admin123', role: 'admin' });
  const token = (await request(app).post('/api/auth/login').send({ email: 'admin-gmail@example.com', password: 'admin123' })).body.accessToken;
  return {
    get: (u) => request(app).get(u).set('Authorization', `Bearer ${token}`),
    put: (u, b) => request(app).put(u).set('Authorization', `Bearer ${token}`).send(b),
    post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${token}`).send(b || {})
  };
}

// Giả lập các API của Google; ghi lại mọi lời gọi để kiểm tra
function mockGoogle({ tokenError } = {}) {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const body = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), headers: opts.headers || {}, body });
    const json = (status, data) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      if (tokenError) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      if (body.grant_type === 'authorization_code') return json(200, { access_token: 'at-1', refresh_token: REFRESH, expires_in: 3599 });
      return json(200, { access_token: 'at-refreshed', expires_in: 3599 });
    }
    if (String(url).includes('/userinfo')) return json(200, { email: 'shop.techshop@gmail.com' });
    if (String(url).includes('/messages/send')) return json(200, { id: 'msg-1' });
    if (String(url).includes('/revoke')) return json(200, {});
    return realFetch(url, opts);
  };
  return { calls, restore: () => (global.fetch = realFetch) };
}

beforeEach(() => clearMailConfigCache());

describe('Gửi email bằng Gmail API (OAuth2)', () => {
  test('TC-61: Kết nối tài khoản Gmail: link cấp quyền đúng, chặn "state" giả, lưu refresh token đã mã hóa', async () => {
    const admin = await adminAgent();
    expect((await admin.put('/api/settings/mail', { provider: 'gmail', gmailClientId: 'sai-dinh-dang' })).statusCode).toBe(400);
    expect((await admin.put('/api/settings/mail', { provider: 'gmail', gmailClientId: CLIENT_ID })).statusCode).toBe(400); // thiếu secret
    expect((await admin.put('/api/settings/mail', { provider: 'gmail', gmailClientId: CLIENT_ID, gmailClientSecret: CLIENT_SECRET, from: 'TechShop <x@gmail.com>' })).statusCode).toBe(200);

    const url = new URL((await admin.post('/api/settings/mail/gmail/connect')).body.data.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(url.searchParams.get('scope')).not.toMatch(/gmail\.readonly|mail\.google\.com/); // không xin quyền đọc thư
    expect(url.searchParams.get('access_type')).toBe('offline');
    const state = url.searchParams.get('state');

    const forged = await request(app).get('/api/settings/mail/gmail/callback').query({ code: 'x', state: state.slice(0, -3) + 'abc' });
    expect(forged.statusCode).toBe(302);
    expect(forged.headers.location).toContain('gmail=error');

    const google = mockGoogle();
    try {
      const cb = await request(app).get('/api/settings/mail/gmail/callback').query({ code: 'auth-code', state });
      expect(cb.headers.location).toContain('/admin/settings?tab=email&gmail=connected');
      const exchange = google.calls.find((c) => c.body?.grant_type === 'authorization_code');
      expect(exchange.body).toMatchObject({ code: 'auth-code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: url.searchParams.get('redirect_uri') });
    } finally {
      google.restore();
    }
    const doc = await MailConfig.findOne().lean();
    expect(doc.gmailEmail).toBe('shop.techshop@gmail.com');
    expect(JSON.stringify(doc)).not.toContain(REFRESH);
    expect(JSON.stringify(doc)).not.toContain(CLIENT_SECRET);
    const view = (await admin.get('/api/settings/mail')).body;
    expect(view.data).toMatchObject({ gmailConnected: true, gmailEmail: 'shop.techshop@gmail.com' });
    expect(JSON.stringify(view)).not.toMatch(new RegExp(`${REFRESH}|${CLIENT_SECRET}`));
  });

  test('TC-62: OTP đăng ký gửi qua Gmail API: đúng người nhận, người gửi là Gmail đã kết nối, tiêu đề tiếng Việt', async () => {
    const admin = await adminAgent();
    await admin.put('/api/settings/mail', { provider: 'gmail', gmailClientId: CLIENT_ID, gmailClientSecret: CLIENT_SECRET, from: 'TechShop Store <ai-do@khac.com>' });
    await MailConfig.updateOne({}, { gmailRefreshTokenEnc: require('../utils/secretBox').encrypt(REFRESH), gmailEmail: 'shop.techshop@gmail.com' });
    clearMailConfigCache();
    const google = mockGoogle();
    try {
      const res = await request(app).post('/api/auth/register/request-otp').send({ email: 'khach.moi@example.com' });
      expect(res.statusCode).toBe(200);
      const send = google.calls.find((c) => c.url.includes('/messages/send'));
      expect(send.headers.Authorization).toBe('Bearer at-refreshed');
      const raw = Buffer.from(send.body.raw, 'base64url').toString('utf8');
      expect(raw).toContain('To: khach.moi@example.com');
      expect(raw).toMatch(/From: TechShop Store <shop\.techshop@gmail\.com>/); // địa chỉ luôn là Gmail đã kết nối
      expect(raw).toContain('Subject: =?UTF-8?'); // tiêu đề tiếng Việt được mã hóa đúng chuẩn
    } finally {
      google.restore();
    }
  });

  test('TC-63: Quyền Gmail hết hạn -> gửi thử báo lỗi dễ hiểu; ngắt kết nối -> xóa token', async () => {
    const admin = await adminAgent();
    await admin.put('/api/settings/mail', { provider: 'gmail', gmailClientId: CLIENT_ID, gmailClientSecret: CLIENT_SECRET });
    await MailConfig.updateOne({}, { gmailRefreshTokenEnc: require('../utils/secretBox').encrypt('1//het-han'), gmailEmail: 'shop@gmail.com' });
    const google = mockGoogle({ tokenError: true });
    try {
      const test = await admin.post('/api/settings/mail/test', { provider: 'gmail', gmailClientId: CLIENT_ID, to: 'nhan@example.com' });
      expect(test.statusCode).toBe(502);
      expect(test.body.message).toMatch(/hết hạn hoặc bị thu hồi/);
      const off = await admin.post('/api/settings/mail/gmail/disconnect');
      expect(off.body.data.gmailConnected).toBe(false);
      expect(google.calls.some((c) => c.url.includes('/revoke'))).toBe(true);
    } finally {
      google.restore();
    }
    expect((await MailConfig.findOne().lean()).gmailRefreshTokenEnc).toBe('');
  });
});
