// BỘ PHẬN KẾ TOÁN: quyền tài chính riêng (chỉ xem đơn) + Dashboard kế toán / kế toán trưởng
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');
const User = require('../models/User');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;
const FINANCE = ['orders.view', 'finance.payments', 'finance.cod', 'einvoices.manage', 'finance.reports'];

async function setup() {
  const storeA = await Store.create({ name: 'CN A' });
  const storeB = await Store.create({ name: 'CN B' });
  const g = await Group.create({ name: 'Kế toán', permissions: FINANCE });
  const chief = await Admin.create({ name: 'KTT', email: 'ktt@t.vn', password: 'abc12345', role: 'staff', title: 'Kế toán trưởng', groupIds: [g._id] });
  await Admin.create({ name: 'KT A', email: 'kta@t.vn', password: 'abc12345', role: 'staff', title: 'Kế toán chi nhánh', groupIds: [g._id], storeId: storeA._id, managerId: chief._id });
  await Admin.create({ name: 'KT B', email: 'ktb@t.vn', password: 'abc12345', role: 'staff', title: 'Kế toán chi nhánh', groupIds: [g._id], storeId: storeB._id, managerId: chief._id });
  const customer = await User.create({ displayName: 'Khách', email: 'k-acc@t.vn', password: '123456' });
  const base = { userId: customer._id, items: [{ productId: customer._id, quantity: 1, unitPrice: 500000, name: 'SP' }], deliveryAddress: { fullName: 'Khách', phone: '0900000000' }, itemsTotal: 500000, grandTotal: 500000, deliveryMethod: 'store_pickup' };
  const transferA = await Order.create({ ...base, orderCode: 'DHKTA', storeId: storeA._id, paymentMode: 'bank_transfer', status: 'pending', paymentStatus: 'pending' });
  const transferB = await Order.create({ ...base, orderCode: 'DHKTB', storeId: storeB._id, paymentMode: 'bank_transfer', status: 'pending', paymentStatus: 'pending' });
  return { transferA, transferB };
}

describe('Kế toán', () => {
  test('KT-1: kế toán chi nhánh xác nhận chuyển khoản chi nhánh mình; không đổi trạng thái đơn; không đụng chi nhánh khác', async () => {
    const { transferA, transferB } = await setup();
    const t = await login('kta@t.vn');
    const list = await auth(request(app).get('/api/orders/admin/all'), t);
    expect(list.status).toBe(200);
    expect(list.body.data.map((o) => o.orderCode)).toEqual(['DHKTA']); // chỉ chi nhánh mình
    expect((await auth(request(app).get(`/api/orders/${transferA._id}`), t)).status).toBe(200);
    expect((await auth(request(app).put(`/api/orders/${transferA._id}/status`), t).send({ status: 'confirmed' })).status).toBe(403); // không sửa trạng thái
    expect((await auth(request(app).post(`/api/orders/${transferB._id}/confirm-payment`), t).send({ confirmed: true })).status).toBe(403); // chi nhánh khác
    const ok = await auth(request(app).post(`/api/orders/${transferA._id}/confirm-payment`), t).send({ confirmed: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.paymentStatus).toBe('paid');
  });

  test('KT-2: kế toán chỉ xem tab tiền của trang giao hàng; được vào hóa đơn điện tử và thống kê', async () => {
    await setup();
    const t = await login('kta@t.vn');
    expect((await auth(request(app).get('/api/deliveries?view=pending'), t)).status).toBe(403);
    expect((await auth(request(app).get('/api/deliveries?view=cod'), t)).status).toBe(200);
    expect((await auth(request(app).get('/api/deliveries/board'), t)).status).toBe(403);
    expect((await auth(request(app).get('/api/einvoices'), t)).status).toBe(200);
    expect((await auth(request(app).get('/api/dashboard/summary'), t)).status).toBe(200);
  });

  test('KT-2b: kế toán xem tab vận đơn và đối soát COD đơn vị vận chuyển (GHN) của chi nhánh mình', async () => {
    await setup();
    const storeA = await Store.findOne({ name: 'CN A' });
    const o = await Order.create({
      orderCode: 'DHKTGHN', storeId: storeA._id, status: 'delivered', paymentMode: 'cod', deliveryMethod: 'home_delivery',
      items: [{ productId: storeA._id, quantity: 1, unitPrice: 300000, name: 'SP' }], itemsTotal: 300000, grandTotal: 300000,
      deliveryAddress: { fullName: 'K', phone: '0900000000' },
      shipment: { provider: 'GHN', environment: 'simulation', phase: 'active', code: 'GHNKT1', status: 'delivered', codAmount: 300000 }
    });
    const t = await login('kta@t.vn');
    expect((await auth(request(app).get('/api/deliveries?view=carrier'), t)).status).toBe(200);
    expect((await auth(request(app).post(`/api/deliveries/${o._id}/shipment/settle`), t).send({ reference: 'PCT-001' })).status).toBe(200);
    expect((await Order.findById(o._id)).shipment.codSettlementReference).toBe('PCT-001');
    // Kế toán chi nhánh khác không đối soát được
    expect((await auth(request(app).post(`/api/deliveries/${o._id}/shipment/settle`), await login('ktb@t.vn')).send({ reference: 'X' })).status).toBe(403);
  });

  test('KT-4: kế toán trưởng cấu hình hóa đơn điện tử; kế toán chi nhánh không; báo cáo nhân viên có chỉ số kế toán', async () => {
    const { transferA } = await setup();
    const chiefGroup = await Group.create({ name: 'KTT cfg', permissions: [...FINANCE, 'einvoices.config'] });
    await Admin.updateOne({ email: 'ktt@t.vn' }, { $set: { groupIds: [chiefGroup._id] } });
    const chief = await login('ktt@t.vn');
    expect((await auth(request(app).get('/api/settings/einvoice'), chief)).status).toBe(200);
    const kta = await login('kta@t.vn');
    expect((await auth(request(app).get('/api/settings/einvoice'), kta)).status).toBe(403);
    // Kế toán A xác nhận 1 khoản -> báo cáo của A có 1 chuyển khoản đã xác nhận; kế toán trưởng xem được
    await auth(request(app).post(`/api/orders/${transferA._id}/confirm-payment`), kta).send({ confirmed: true });
    const ktaId = (await Admin.findOne({ email: 'kta@t.vn' }))._id;
    const rep = await auth(request(app).get(`/api/staff-reports/staff/${ktaId}`), chief);
    expect(rep.status).toBe(200);
    expect(rep.body.data.staff.kind).toBe('accountant');
    expect(rep.body.data.metrics.finance).toMatchObject({ transfers: 1, transferAmount: 500000 });
    const team = await auth(request(app).get('/api/staff-reports/team'), chief);
    expect(team.body.data.staff.filter((s) => s.kind === 'accountant').map((s) => s.name).sort()).toEqual(['KT A', 'KT B']);
    expect(team.body.data.totals.finance.transfers).toBe(1);
  });

  test('KT-3: Dashboard kế toán; kế toán trưởng thấy mọi chi nhánh + đội kế toán viên', async () => {
    await setup();
    const a = (await auth(request(app).get('/api/workspace'), await login('kta@t.vn'))).body.data;
    expect(a.role).toBe('accountant');
    expect(a.accounting).toMatchObject({ scope: 'store', transfer: { n: 1, amount: 500000 } });
    expect(a.accounting.stores).toBeUndefined();
    const c = (await auth(request(app).get('/api/workspace'), await login('ktt@t.vn'))).body.data;
    expect(c.accounting.scope).toBe('all');
    expect(c.accounting.transfer.n).toBe(2);
    expect(c.accounting.stores.map((s) => s.name).sort()).toEqual(['CN A', 'CN B']);
    expect(c.accounting.team.map((x) => x.name).sort()).toEqual(['KT A', 'KT B']);
  });
});
