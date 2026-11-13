// Báo khách các bước vận đơn (đang giao tới, giao thất bại, chuyển hoàn) + trang theo dõi công khai cho vận đơn GHN
jest.mock('../utils/ghn', () => ({ locations: jest.fn(), shopFor: jest.fn(), create: jest.fn(), detail: jest.fn(), cancel: jest.fn(), call: jest.fn() }));
require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const ghn = require('../utils/ghn');
const shippingConfig = require('../utils/shippingConfig');
const { trackingInfo } = require('../utils/notifyEmail');
const { flushEmails } = require('../utils/notifyEmail');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);
beforeEach(() => {
  process.env.SHIPPING_PROVIDER = 'ghn_sandbox';
  process.env.GHN_TOKEN = 'ghn-token-abcdef123';
  shippingConfig.clearShippingConfigCache();
  jest.clearAllMocks();
});
afterEach(async () => { delete process.env.SHIPPING_PROVIDER; delete process.env.GHN_TOKEN; await flushEmails(); });

async function setup() {
  await Order.init();
  const store = await Store.create({ name: 'CN SN', city: 'Hồ Chí Minh' });
  const group = await Group.create({ name: 'GH', permissions: ['orders.manage', 'deliveries.manage'] });
  const manager = await Admin.create({ name: 'QL SN', email: 'qlsn@test.vn', password: '12345678', role: 'staff', storeId: store._id, groupIds: [group._id] });
  const user = await User.create({ displayName: 'Khách SN', email: 'khachsn@test.vn', password: '12345678', phoneNumber: '0901234599' });
  const order = await Order.create({
    orderCode: 'SN-001', userId: user._id, storeId: store._id, paymentMode: 'cod', status: 'shipping', deliveryMethod: 'home_delivery',
    itemsTotal: 100000, grandTotal: 100000, items: [{ productId: store._id, quantity: 1, unitPrice: 100000, name: 'Phone' }],
    deliveryAddress: { fullName: 'Khách SN', phone: '0901234599', addressLine1: '1 Lê Lợi', city: 'Hồ Chí Minh' },
    deliveryPlan: { mode: 'ghn', provinceName: 'Hồ Chí Minh' },
    shipment: { provider: 'GHN', environment: 'sandbox', phase: 'active', code: 'LBKX7Q', shopId: 885123, status: 'transporting', events: [{ status: 'transporting', at: new Date() }] }
  });
  const sync = (status) => {
    ghn.detail.mockResolvedValueOnce({ order_code: 'LBKX7Q', status });
    return auth(request(app).post(`/api/deliveries/${order._id}/shipment/sync`), token(manager)).send({});
  };
  return { user, order, sync };
}

describe('Báo khách theo vận đơn', () => {
  test('SN-1: Đang giao tới / giao thất bại / chuyển hoàn -> báo khách; không báo trùng', async () => {
    const c = await setup();
    const titles = async () => (await Notification.find({ userId: c.user._id }).sort({ createdAt: 1 }).lean()).map((n) => n.title);

    expect((await c.sync('delivering')).statusCode).toBe(200);
    expect(await titles()).toEqual(['Shipper đang giao hàng tới bạn']);
    await c.sync('delivering'); // không đổi trạng thái -> không báo lại
    expect(await titles()).toHaveLength(1);

    await c.sync('delivery_fail');
    expect(await titles()).toContain('Giao hàng chưa thành công');
    await c.sync('waiting_to_return');
    await c.sync('return_transporting'); // vẫn trong nhóm hoàn hàng -> không báo thêm
    const all = await titles();
    expect(all.filter((t) => t === 'Đơn hàng đang được chuyển hoàn')).toHaveLength(1);
    const notif = await Notification.findOne({ title: 'Giao hàng chưa thành công' }).lean();
    expect(notif.link).toBe(`/account/orders/${c.order._id}`);
  });

  test('SN-2: Trang theo dõi công khai nhận vận đơn GHN, chỉ trả thông tin không nhạy cảm; email có link theo dõi', async () => {
    const c = await setup();
    const res = await request(app).get('/api/deliveries/track/LBKX7Q');
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ code: 'LBKX7Q', status: 'transporting', environment: 'sandbox', carrier: 'Giao Hàng Nhanh', destination: 'Hồ Chí Minh' });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('0901234599');
    expect(text).not.toContain('Khách SN');
    expect(text).not.toContain('100000');
    expect((await request(app).get('/api/deliveries/track/KHONGCO1')).statusCode).toBe(404);
    expect((await request(app).get('/api/deliveries/track/%24where')).statusCode).toBe(404);

    const info = trackingInfo(await Order.findById(c.order._id).lean());
    expect(info).toMatchObject({ carrier: 'Giao Hàng Nhanh', code: 'LBKX7Q' });
    expect(info.url).toMatch(/\/van-chuyen\/LBKX7Q$/);
  });
});
