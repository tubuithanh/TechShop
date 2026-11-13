// Cấu hình đơn vị giao hàng trong trang quản trị (thay cho biến môi trường SHIPPING_PROVIDER / GHN_*)
jest.mock('../utils/httpJson', () => ({ httpJson: jest.fn() }));
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const ShippingConfig = require('../models/ShippingConfig');
const { httpJson } = require('../utils/httpJson');
const shippingConfig = require('../utils/shippingConfig');
const ghn = require('../utils/ghn');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const TOKEN = 'ghn-test-token-1234567890';
const ENV_KEYS = ['SHIPPING_PROVIDER', 'GHN_TOKEN', 'GHN_STORE_ID', 'GHN_SHOP_ID', 'GHN_SHOPS_JSON'];

beforeEach(() => {
  shippingConfig.clearShippingConfigCache();
  ENV_KEYS.forEach((k) => delete process.env[k]);
  httpJson.mockReset();
  // Giả lập GHN: trả danh sách cửa hàng nếu đúng token
  httpJson.mockImplementation(async (url, opts) => {
    if (opts.headers.Token !== TOKEN) return { status: 401, data: { code: 401, message: 'Token không hợp lệ' } };
    if (String(url).includes('/v2/shop/all')) {
      return { status: 200, data: { code: 200, data: { shops: [
        { _id: 885123, name: 'TechShop Q1', status: 1, address: '1 Lê Lợi', district_id: 1442, ward_code: '20109' },
        { _id: 885999, name: 'Shop tạm dừng', status: 2 }
      ] } } };
    }
    return { status: 200, data: { code: 200, data: {} } };
  });
});
afterAll(() => ENV_KEYS.forEach((k) => delete process.env[k]));

async function setup() {
  await Admin.create({ name: 'Admin', email: 'adminship@example.com', password: 'admin123', role: 'admin' });
  await Admin.create({ name: 'NV', email: 'nvship@example.com', password: 'abc12345', role: 'staff' });
  const store = await Store.create({ name: 'CN Ship', address: 'x', city: 'Hồ Chí Minh' });
  return { admin: await login('adminship@example.com', 'admin123'), staff: await login('nvship@example.com', 'abc12345'), store };
}

describe('Cấu hình đơn vị giao hàng', () => {
  test('SC-1: Chưa cấu hình -> dùng biến môi trường như cũ; danh sách đơn vị gồm giả lập và GHN; chỉ admin', async () => {
    const c = await setup();
    process.env.SHIPPING_PROVIDER = 'ghn_sandbox';
    process.env.GHN_TOKEN = 'env-token-abcdef';
    process.env.GHN_STORE_ID = String(c.store._id);
    process.env.GHN_SHOP_ID = '777';
    expect(await shippingConfig.isGhnActive()).toBe(true);
    expect((await shippingConfig.ghnSettings()).shops[String(c.store._id)]).toBe('777');

    const res = await auth(request(app).get('/api/settings/shipping'), c.admin);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.config).toMatchObject({ mode: 'env', env: { provider: 'ghn_sandbox', ghnToken: 'env-******', ghnShops: 1 } });
    expect(res.body.data.providers.map((p) => p.id)).toEqual(['simulation', 'ghn_sandbox']);
    expect(res.body.data.providers[1].fields[0]).toMatchObject({ key: 'token', secret: true });
    expect(JSON.stringify(res.body)).not.toContain('env-token-abcdef');
    expect((await auth(request(app).get('/api/settings/shipping'), c.staff)).statusCode).toBe(403);
  });

  test('SC-2: Admin chọn GHN + nhập token + Shop ID theo chi nhánh: lưu mã hóa, áp dụng ngay, không lộ token', async () => {
    const c = await setup();
    const save = (body) => auth(request(app).put('/api/settings/shipping'), c.admin).send(body);
    const ghnBody = (over = {}) => ({ mode: 'custom', activeProvider: 'ghn_sandbox', providers: { ghn_sandbox: { values: { token: TOKEN }, shops: { [c.store._id]: '885123' } } }, ...over });

    expect((await save({ ...ghnBody(), providers: { ghn_sandbox: { values: {}, shops: { [c.store._id]: '885123' } } } })).body.message).toMatch(/Token API/);
    expect((await save({ ...ghnBody(), providers: { ghn_sandbox: { values: { token: TOKEN }, shops: {} } } })).body.message).toMatch(/ít nhất 1 chi nhánh/);
    expect((await save({ ...ghnBody(), providers: { ghn_sandbox: { values: { token: TOKEN }, shops: { [c.store._id]: 'abc' } } } })).statusCode).toBe(400);
    expect((await save({ ...ghnBody(), activeProvider: 'grab' })).statusCode).toBe(400);
    expect((await save(ghnBody({ routingApiUrl: 'ftp://x' }))).statusCode).toBe(400);

    const ok = await save(ghnBody());
    expect(ok.statusCode).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain(TOKEN);
    expect(ok.body.data.config.providers.ghn_sandbox).toMatchObject({ secrets: { token: { saved: true, unreadable: false } }, shops: { [c.store._id]: '885123' } });
    const raw = await ShippingConfig.findOne().lean();
    expect(raw.providers.ghn_sandbox.tokenEnc).toBeTruthy();
    expect(JSON.stringify(raw)).not.toContain(TOKEN); // lưu dạng mã hóa

    // Áp dụng ngay: GHN đang dùng, gọi API GHN bằng token đã lưu, đúng Shop ID của chi nhánh
    expect(await shippingConfig.isGhnActive()).toBe(true);
    const shop = await ghn.shopFor(c.store._id);
    expect(shop._id).toBe(885123);
    expect(httpJson.mock.calls.at(-1)[1].headers.Token).toBe(TOKEN);

    // Sửa Shop ID, để trống token -> giữ token cũ
    const keep = await save({ ...ghnBody(), providers: { ghn_sandbox: { values: { token: '' }, shops: { [c.store._id]: '885124' } } } });
    expect(keep.statusCode).toBe(200);
    expect((await shippingConfig.ghnSettings())).toMatchObject({ token: TOKEN, shops: { [c.store._id]: '885124' } });

    // Chuyển về giả lập (vẫn giữ cấu hình GHN để bật lại)
    expect((await save({ mode: 'custom', activeProvider: 'simulation' })).statusCode).toBe(200);
    expect(await shippingConfig.isGhnActive()).toBe(false);
    expect((await shippingConfig.ghnSettings()).token).toBe(TOKEN);
    // Quay lại dùng biến môi trường
    expect((await save({ mode: 'env' })).statusCode).toBe(200);
    expect(await shippingConfig.activeProvider()).toBe('simulation');
  });

  test('SC-3: Kiểm tra kết nối GHN bằng dữ liệu đang nhập (chưa lưu): token sai / Shop ID không hoạt động / hợp lệ', async () => {
    const c = await setup();
    const test = (values, shops) => auth(request(app).post('/api/settings/shipping/test'), c.admin).send({ provider: 'ghn_sandbox', values, shops });
    const bad = await test({ token: 'sai-token-1234567' }, { [c.store._id]: '885123' });
    expect(bad.body.data.ok).toBe(false);
    const inactive = await test({ token: TOKEN }, { [c.store._id]: '885999' });
    expect(inactive.body.data).toMatchObject({ ok: false });
    expect(inactive.body.data.message).toMatch(/885999/);
    const good = await test({ token: TOKEN }, { [c.store._id]: '885123' });
    expect(good.body.data).toMatchObject({ ok: true });
    expect(good.body.data.shops).toHaveLength(2);
    expect((await auth(request(app).post('/api/settings/shipping/test'), c.admin).send({ provider: 'simulation' })).body.data.ok).toBe(true);
    expect(await ShippingConfig.countDocuments()).toBe(0); // kiểm tra không lưu gì
  });
});
