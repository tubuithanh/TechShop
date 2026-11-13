// Phân công giao hàng theo cấu hình đơn vị vận chuyển: shop tự giao / giả lập / GHN sandbox (gọi GHN được giả lập)
jest.mock('../utils/ghn', () => ({ locations: jest.fn(), shopFor: jest.fn(), create: jest.fn(), detail: jest.fn(), cancel: jest.fn(), call: jest.fn() }));
require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');
const ghn = require('../utils/ghn');
const shippingConfig = require('../utils/shippingConfig');
const { flushEmails } = require('../utils/notifyEmail');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);
const ENV = ['SHIPPING_PROVIDER', 'GHN_TOKEN', 'GHN_STORE_ID', 'GHN_SHOP_ID', 'GHN_SHOPS_JSON'];

beforeEach(() => {
  ENV.forEach((k) => delete process.env[k]);
  shippingConfig.clearShippingConfigCache();
  jest.clearAllMocks();
  ghn.locations.mockImplementation(async (kind, parent) => (kind === 'provinces'
    ? [{ ProvinceID: 202, ProvinceName: 'Hồ Chí Minh', NameExtension: ['TP. Hồ Chí Minh'] }, { ProvinceID: 201, ProvinceName: 'Hà Nội' }]
    : kind === 'districts' ? [{ DistrictID: Number(parent) === 202 ? 1442 : 1485, DistrictName: 'Quận 1' }]
      : [{ WardCode: '20109', WardName: 'Phường Bến Nghé' }]));
  ghn.shopFor.mockResolvedValue({ _id: 885123, district_id: 1442, ward_code: '20109' });
  ghn.create.mockResolvedValue({ order_code: 'GHN-SANDBOX-01', total_fee: 32000, expected_delivery_time: '2026-12-01T00:00:00Z' });
  ghn.call.mockResolvedValue({ total: 32000, service_fee: 30000, insurance_fee: 2000 });
});
afterEach(() => { ENV.forEach((k) => delete process.env[k]); flushEmails(); });

async function setup(status = 'processing') {
  await Order.init();
  const store = await Store.create({ name: 'CN Q1', city: 'TP. Hồ Chí Minh', address: '1 Lê Lợi' });
  const group = await Group.create({ name: 'Giao hàng', permissions: ['orders.manage', 'deliveries.manage', 'deliveries.perform'] });
  const manager = await Admin.create({ name: 'QL', email: 'qlcd@test.vn', password: '12345678', role: 'staff', storeId: store._id, groupIds: [group._id] });
  const shipper = await Admin.create({ name: 'Shipper A', email: 'shipcd@test.vn', password: '12345678', role: 'staff', storeId: store._id, groupIds: [group._id] });
  const order = await Order.create({
    orderCode: `CD-${Math.random()}`, storeId: store._id, paymentMode: 'cod', status, deliveryMethod: 'home_delivery', itemsTotal: 100000, grandTotal: 130000, shippingFee: 30000,
    items: [{ productId: store._id, quantity: 1, unitPrice: 100000, name: 'Phone' }],
    deliveryAddress: { fullName: 'Khách', phone: '0901234567', addressLine1: '12 Nguyễn Huệ', state: 'Phường Bến Nghé', city: 'TP. Hồ Chí Minh' }
  });
  const api = (method, path, body = {}) => auth(request(app)[method](`/api/deliveries/${order._id}/${path}`), token(manager)).send(body);
  const useGhn = () => {
    process.env.SHIPPING_PROVIDER = 'ghn_sandbox';
    process.env.GHN_TOKEN = 'ghn-token-abcdef123';
    process.env.GHN_SHOPS_JSON = JSON.stringify({ [store._id]: '885123' });
  };
  return { store, manager, shipper, order, api, useGhn };
}
const GHN_BODY = { method: 'ghn_sandbox', ghn: { provinceId: 202, districtId: 1442, wardCode: '20109', weight: 800, length: 25, width: 18, height: 10 } };

describe('Phân công cho đơn vị vận chuyển theo cấu hình', () => {
  test('CD-1: Danh sách cách giao: chưa cấu hình GHN -> GHN không dùng được (kèm lý do), mặc định giả lập', async () => {
    const c = await setup();
    const res = await c.api('get', 'carriers');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.options.map((o) => o.id)).toEqual(['internal', 'simulation', 'ghn_sandbox']);
    const g = res.body.data.options.find((o) => o.id === 'ghn_sandbox');
    expect(g).toMatchObject({ available: false });
    expect(g.reason).toMatch(/Token GHN/);
    expect(res.body.data.defaultMethod).toBe('simulation');
    expect((await c.api('post', 'dispatch', GHN_BODY)).body.message).toMatch(/Token GHN/);

    c.useGhn();
    const after = (await c.api('get', 'carriers')).body.data;
    expect(after.options.find((o) => o.id === 'ghn_sandbox').available).toBe(true);
    expect(after.defaultMethod).toBe('ghn_sandbox'); // đơn vị đang dùng trong cấu hình
  });

  test('CD-2: GHN sandbox: phí ước tính; tạo vận đơn thật (gọi GHN) với địa chỉ + kiện hàng đã chọn', async () => {
    const c = await setup();
    c.useGhn();
    const fee = await c.api('post', 'carriers/ghn/fee', GHN_BODY.ghn);
    expect(fee.body.data.total).toBe(32000);
    expect(ghn.call.mock.calls[0][0]).toBe('/v2/shipping-order/fee');
    expect(ghn.call.mock.calls[0][1]).toMatchObject({ shopId: 885123, body: { to_district_id: 1442, to_ward_code: '20109', weight: 800, cod_value: 130000 } });

    // Tỉnh không khớp địa chỉ đơn -> từ chối
    expect((await c.api('post', 'dispatch', { ...GHN_BODY, ghn: { ...GHN_BODY.ghn, provinceId: 201, districtId: 1485 } })).statusCode).toBe(400);

    const res = await c.api('post', 'dispatch', GHN_BODY);
    expect(res.statusCode).toBe(201);
    expect(res.body.data.shipment).toMatchObject({ provider: 'GHN', environment: 'sandbox', phase: 'active', code: 'GHN-SANDBOX-01', shopId: 885123, codAmount: 130000 });
    const [shopId, payload] = ghn.create.mock.calls[0];
    expect(shopId).toBe(885123);
    expect(payload).toMatchObject({ to_district_id: 1442, to_ward_code: '20109', weight: 800, length: 25, cod_amount: 130000 });
    const saved = await Order.findById(c.order._id).lean();
    expect(saved.deliveryPlan).toMatchObject({ mode: 'ghn', provinceId: 202, districtId: 1442, wardCode: '20109' });
    // Đã có vận đơn hoạt động -> không phân công lại
    expect((await c.api('post', 'dispatch', { method: 'simulation' })).statusCode).toBe(409);
  });

  test('CD-3: GHN cần đơn "Đang chuẩn bị"; giả lập và shop tự giao vẫn chạy như cũ', async () => {
    const c = await setup('confirmed');
    c.useGhn();
    expect((await c.api('post', 'dispatch', GHN_BODY)).body.message).toMatch(/Đang chuẩn bị/);
    expect(ghn.create).not.toHaveBeenCalled();

    const sim = await c.api('post', 'dispatch', { method: 'simulation' });
    expect(sim.statusCode).toBe(200);
    expect(sim.body.data.shipment).toMatchObject({ environment: 'simulation', phase: 'active' });
    expect(ghn.create).not.toHaveBeenCalled();
  });

  test('CD-4: Shop tự giao: phân công nhân viên giao hàng của chi nhánh', async () => {
    const c = await setup();
    const res = await c.api('post', 'dispatch', { method: 'internal', shipperId: String(c.shipper._id) });
    expect(res.statusCode).toBe(200);
    expect(String(res.body.data.shipperId)).toBe(String(c.shipper._id));
    expect(res.body.data.deliveryPlan.mode).toBe('internal');
  });
});
