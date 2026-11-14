// Phân tích bán hàng + chỉ tiêu tháng trong "Báo cáo của tôi" của nhân viên bán hàng
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const User = require('../models/User');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;

async function setup() {
  const storeA = await Store.create({ name: 'CN A' });
  const storeB = await Store.create({ name: 'CN B' });
  const seller = await Admin.create({ name: 'NV Bán', email: 'ban@t.vn', password: 'abc12345', role: 'staff', title: 'Nhân viên bán hàng', storeId: storeA._id });
  await Admin.create({ name: 'CHT A', email: 'chta@t.vn', password: 'abc12345', role: 'staff', title: 'Cửa hàng trưởng', storeId: storeA._id });
  await Admin.create({ name: 'CHT B', email: 'chtb@t.vn', password: 'abc12345', role: 'staff', title: 'Cửa hàng trưởng', storeId: storeB._id });
  const member = await User.create({ displayName: 'Khách quen', email: 'kq@t.vn', password: '123456', phoneNumber: '0912345678' });
  const base = { source: 'pos', createdBy: seller._id, storeId: storeA._id, items: [{ productId: member._id, quantity: 2, unitPrice: 500000, name: 'SP' }], deliveryAddress: { fullName: 'Khách', phone: '0900000000' }, itemsTotal: 1000000, deliveryMethod: 'store_pickup' };
  let n = 0;
  const mk = (extra) => Order.create({ ...base, orderCode: `DHSI${++n}`, paymentMode: 'cash', status: 'delivered', grandTotal: 1000000, ...extra });
  await mk({ userId: member._id, voucherCode: 'GIAM10', discountAmount: 100000, grandTotal: 900000 });
  await mk({ paymentMode: 'bank_transfer' }); // khách lẻ
  await mk({ status: 'cancelled' });
  return { seller };
}

describe('Phân tích bán hàng của nhân viên', () => {
  test('SI-1: nhân viên xem được phân tích của mình: chất lượng, thanh toán, khách, đơn gần đây', async () => {
    await setup();
    const r = await auth(request(app).get('/api/staff-reports/me/sales'), await login('ban@t.vn'));
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.quality).toMatchObject({ total: 3, cancelled: 1, voucherOrders: 1 });
    expect(d.quality.cancelRate).toBeCloseTo(33.3, 1);
    expect(d.payment.map((p) => p.mode).sort()).toEqual(['bank_transfer', 'cash']);
    expect(d.customers).toMatchObject({ members: 1, newMembers: 1, guestOrders: 1 });
    expect(d.customers.top[0].name).toBe('Khách quen');
    expect(d.recent).toHaveLength(3);
    expect(d.target).toMatchObject({ revenue: 1900000, orders: 2, target: null });
  });

  test('SI-2: trưởng cửa hàng đặt chỉ tiêu cho nhân viên chi nhánh mình; nhân viên không tự đặt; chi nhánh khác bị chặn', async () => {
    const { seller } = await setup();
    const put = (t, body) => auth(request(app).put(`/api/staff-reports/staff/${seller._id}/target`), t).send(body);
    expect((await put(await login('ban@t.vn'), { amount: 5000000 })).status).toBe(403);
    expect((await put(await login('chtb@t.vn'), { amount: 5000000 })).status).toBe(403);
    expect((await put(await login('chta@t.vn'), { amount: -1 })).status).toBe(400);
    const ok = await put(await login('chta@t.vn'), { amount: 4000000 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.target.amount).toBe(4000000);
    expect(ok.body.data.percent).toBeCloseTo(47.5, 1);
    // Chi nhánh khác không xem được phân tích
    expect((await auth(request(app).get(`/api/staff-reports/staff/${seller._id}/sales`), await login('chtb@t.vn'))).status).toBe(403);
    expect((await auth(request(app).get(`/api/staff-reports/staff/${seller._id}/sales`), await login('chta@t.vn'))).status).toBe(200);
  });
});
