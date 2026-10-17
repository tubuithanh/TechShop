require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');

// Giả lập máy chủ Zalo: đổi code -> access_token, và graph.zalo.me trả id của access_token
const ZALO_IDS = { 'tok-cua-A': '1111', 'tok-cua-B': '2222' };
let tokenCalls;
beforeEach(() => {
  process.env.ZALO_APP_ID = 'app-test';
  process.env.ZALO_APP_SECRET = 'secret-test';
  process.env.ZALO_REDIRECT_URI = 'https://localhost:5443/api/auth/zalo/callback';
  tokenCalls = [];
  const realFetch = global.fetch;
  jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://oauth.zaloapp.com/v4/access_token')) {
      tokenCalls.push(Object.fromEntries(new URLSearchParams(String(opts.body))));
      return new Response(JSON.stringify({ access_token: 'tok-cua-A' }));
    }
    if (u.startsWith('https://graph.zalo.me/v2.0/me')) {
      const id = ZALO_IDS[opts.headers.access_token];
      return new Response(JSON.stringify(id ? { id } : { error: 452, message: 'Personal information is limited' }));
    }
    return realFetch(url, opts);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.ZALO_ALLOW_UNVERIFIED_ID;
});

const sessionFor = (accessToken) => jwt.sign({ zaloAccessToken: accessToken }, process.env.JWT_ACCESS_SECRET, { expiresIn: '3m' });
const complete = (body) => request(app).post('/api/auth/zalo/complete').send(body);

describe('Đăng nhập Zalo', () => {
  test('TC-135: state ngẫu nhiên, code_verifier giữ trong cookie httpOnly; callback phải khớp state của chính trình duyệt đó', async () => {
    const start = await request(app).get('/api/auth/zalo/login');
    expect(start.statusCode).toBe(302);
    const authUrl = new URL(start.headers.location);
    const state = authUrl.searchParams.get('state');
    const cookie = start.headers['set-cookie'].find((c) => c.startsWith('zalo_pkce='));
    expect(cookie).toMatch(/HttpOnly/);
    // code_verifier không còn nằm trong URL
    const { v } = jwt.decode(decodeURIComponent(cookie.split(';')[0].split('=')[1]));
    expect(authUrl.toString()).not.toContain(v);

    // Không có cookie, hoặc state sai -> từ chối, không đổi code lấy token
    expect((await request(app).get(`/api/auth/zalo/callback?code=abc&state=${state}`)).headers.location).toMatch(/error=zalo_failed/);
    expect((await request(app).get('/api/auth/zalo/callback?code=abc&state=sai').set('Cookie', cookie)).headers.location).toMatch(/error=zalo_failed/);
    expect(tokenCalls).toHaveLength(0);

    // Đúng state -> đổi code bằng đúng code_verifier đã cất, chuyển về trang hoàn tất
    const ok = await request(app).get(`/api/auth/zalo/callback?code=abc&state=${state}`).set('Cookie', cookie);
    expect(ok.headers.location).toMatch(/\/zalo-finish#session=/);
    expect(tokenCalls[0].code_verifier).toBe(v);
  });

  test('TC-136: Không vào được tài khoản Zalo của người khác bằng phiên của mình; id phải đúng với Zalo', async () => {
    await User.create({ displayName: 'Nạn nhân', zaloId: '2222', password: 'ngaunhien-123456' });

    // A đăng nhập Zalo thật (phiên của A) nhưng gửi id của B
    const attack = await complete({ id: '2222', name: 'B', session: sessionFor('tok-cua-A') });
    expect(attack.statusCode).toBe(401);

    const own = await complete({ id: '1111', name: 'A', session: sessionFor('tok-cua-A') });
    expect(own.statusCode).toBe(200);
    expect((await User.findOne({ zaloId: '1111' })).displayName).toBe('A');

    // Máy chủ không xác minh được id -> từ chối (trừ khi bật ZALO_ALLOW_UNVERIFIED_ID)
    expect((await complete({ id: '3333', session: sessionFor('tok-bi-chan') })).statusCode).toBe(502);
    process.env.ZALO_ALLOW_UNVERIFIED_ID = 'true';
    expect((await complete({ id: '3333', session: sessionFor('tok-bi-chan') })).statusCode).toBe(200);
  });
});
