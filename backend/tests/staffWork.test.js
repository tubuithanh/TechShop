require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const User = require('../models/User');
const StaffAssignment = require('../models/StaffAssignment');
const { ensureStoreManager, STORE_MANAGER_ACCOUNT } = require('../seed/storeManager');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const DAY = 864e5;

async function setup() {
  const [storeA, storeB, storeC] = await Store.create([{ name: 'CN A' }, { name: 'CN B' }, { name: 'CN C' }]);
  const customer = await User.create({ displayName: 'Khách', email: 'khachsw@example.com', password: '123456' });
  const base = {
    userId: customer._id, items: [{ productId: customer._id, quantity: 1, unitPrice: 100000, name: 'SP' }],
    deliveryAddress: { fullName: 'Khách', phone: '0900000000' }, paymentMode: 'cod', itemsTotal: 100000, grandTotal: 100000, status: 'pending'
  };
  const orders = await Order.create([
    { ...base, orderCode: 'SWA1', storeId: storeA._id },
    { ...base, orderCode: 'SWB1', storeId: storeB._id },
    { ...base, orderCode: 'SWC1', storeId: storeC._id }
  ]);
  await Admin.create({ name: 'Admin', email: 'adminsw@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'adminsw@example.com', password: 'admin123' })).body.accessToken;
  await ensureStoreManager(storeA);
  const manager = await Admin.findOne({ email: STORE_MANAGER_ACCOUNT.email });
  const login = async () => (await request(app).post('/api/auth/login').send(STORE_MANAGER_ACCOUNT)).body.accessToken;
  const orderCodes = async (token, storeId) => {
    const r = request(app).get('/api/orders/admin/all');
    if (storeId) r.set('X-Store-Id', String(storeId));
    return (await auth(r, token)).body.data.map((o) => o.orderCode).sort();
  };
  return { storeA, storeB, storeC, orders, admin, manager, login, orderCodes };
}

describe('Nhân viên & quản lý: điều chuyển, nhiều chi nhánh, quá trình làm việc', () => {
  test('SW-1: Điều chuyển tạm thời 6 tháng: đang điều chuyển thì làm việc ở chi nhánh mới; kết thúc thì về chi nhánh chính', async () => {
    const c = await setup();
    const token = await c.login();
    expect(await c.orderCodes(token)).toEqual(['SWA1']);

    const transfer = (body) => auth(request(app).post(`/api/staff/${c.manager._id}/transfers`), c.admin).send(body);
    expect((await transfer({ storeId: c.storeB._id })).statusCode).toBe(400); // thiếu thời hạn
    expect((await transfer({ storeId: c.storeA._id, months: 6 })).statusCode).toBe(400); // đang ở chi nhánh này
    const t = await transfer({ storeId: c.storeB._id, months: 6, reason: 'Hỗ trợ khai trương' });
    expect(t.statusCode).toBe(201);
    expect(t.body.data.state).toBe('active');
    const months = (new Date(t.body.data.endDate) - new Date(t.body.data.startDate)) / DAY;
    expect(months).toBeGreaterThan(180);
    expect(months).toBeLessThan(186);
    expect((await transfer({ storeId: c.storeC._id, months: 1 })).statusCode).toBe(409); // trùng thời gian

    // Đang điều chuyển: chỉ thấy chi nhánh B (token cũ vẫn dùng được, phạm vi tính lại mỗi request)
    expect(await c.orderCodes(token)).toEqual(['SWB1']);
    const me = (await auth(request(app).get('/api/auth/me'), token)).body.user;
    expect(me.storeId.name).toBe('CN B');
    expect(me.storeScope.transfer).toBeTruthy();
    expect(me.homeStoreId).toBeTruthy();
    expect((await auth(request(app).get(`/api/orders/${c.orders[0]._id}`), token)).statusCode).toBe(403);

    // Kết thúc sớm -> về chi nhánh A
    const end = await auth(request(app).post(`/api/staff/${c.manager._id}/transfers/${t.body.data._id}/end`), c.admin).send({ note: 'Đã ổn định' });
    expect(end.body.data.state).toBe('ended');
    expect(await c.orderCodes(token)).toEqual(['SWA1']);

    // Điều chuyển trong tương lai -> chưa có hiệu lực, hủy được
    const later = await transfer({ storeId: c.storeC._id, startDate: new Date(Date.now() + 10 * DAY), months: 2 });
    expect(later.body.data.state).toBe('upcoming');
    expect(await c.orderCodes(token)).toEqual(['SWA1']);
    const cancel = await auth(request(app).post(`/api/staff/${c.manager._id}/transfers/${later.body.data._id}/end`), c.admin).send({});
    expect(cancel.body.data.state).toBe('cancelled');
  });

  test('SW-2: Một quản lý phụ trách nhiều chi nhánh: chọn chi nhánh đang làm việc; mở được đơn của mọi chi nhánh mình quản lý', async () => {
    const c = await setup();
    const upd = await auth(request(app).put(`/api/staff/${c.manager._id}`), c.admin).send({ managedStoreIds: [c.storeB._id, c.storeA._id, 'abc'] });
    expect(upd.statusCode).toBe(400);
    expect((await auth(request(app).put(`/api/staff/${c.manager._id}`), c.admin).send({ managedStoreIds: [c.storeB._id, c.storeA._id], title: 'Quản lý khu vực' })).statusCode).toBe(200);
    expect((await Admin.findById(c.manager._id)).managedStoreIds.map(String)).toEqual([String(c.storeB._id)]); // bỏ trùng chi nhánh chính

    const token = await c.login();
    const stores = (await auth(request(app).get('/api/staff/me/stores'), token)).body.data;
    expect(stores.stores.map((s) => s.name).sort()).toEqual(['CN A', 'CN B']);
    expect(await c.orderCodes(token)).toEqual(['SWA1']); // mặc định chi nhánh chính
    expect(await c.orderCodes(token, c.storeB._id)).toEqual(['SWB1']); // chọn chi nhánh B
    expect(await c.orderCodes(token, c.storeC._id)).toEqual(['SWA1']); // C không quản lý -> bỏ qua
    expect((await auth(request(app).get(`/api/orders/${c.orders[1]._id}`), token)).statusCode).toBe(200); // B: được mở
    expect((await auth(request(app).get(`/api/orders/${c.orders[2]._id}`), token)).statusCode).toBe(403); // C: không

    // Lịch sử ghi lại việc phụ trách thêm chi nhánh B
    const history = (await auth(request(app).get(`/api/staff/${c.manager._id}/assignments`), c.admin)).body.data;
    expect(history.map((h) => `${h.kind}:${h.storeId.name}:${h.state}`).sort()).toEqual(['home:CN A:active', 'manage:CN B:active']);
    // Thôi phụ trách -> giai đoạn được đóng lại
    await auth(request(app).put(`/api/staff/${c.manager._id}`), c.admin).send({ managedStoreIds: [] });
    const after = (await auth(request(app).get(`/api/staff/${c.manager._id}/assignments`), c.admin)).body.data;
    expect(after.find((h) => h.kind === 'manage').state).toBe('ended');
  });

  test('SW-3: Quá trình làm việc + hiệu suất năm (doanh số bán quầy, số ngày ở từng chi nhánh) + đánh giá cuối năm', async () => {
    const c = await setup();
    const year = new Date().getFullYear();
    // Bán tại quầy 2 đơn đã giao
    await Order.create([1, 2].map((i) => ({
      orderCode: `SWPOS${i}`, source: 'pos', createdBy: c.manager._id, storeId: c.storeA._id, status: 'delivered', paymentStatus: 'paid', paymentMode: 'cash',
      items: [], itemsTotal: 5000000, grandTotal: 5000000, statusHistory: [{ status: 'delivered', changedBy: c.manager._id }]
    })));
    // Đã từng điều chuyển 30 ngày sang B, kết thúc cách đây 10 ngày
    await StaffAssignment.create({ staffId: c.manager._id, storeId: c.storeA._id, kind: 'home', startDate: new Date(`${year}-01-01T00:00:00+07:00`) });
    await StaffAssignment.create({ staffId: c.manager._id, storeId: c.storeB._id, kind: 'transfer', startDate: new Date(Date.now() - 40 * DAY), endDate: new Date(Date.now() - 10 * DAY) });

    const perf = await auth(request(app).get(`/api/staff/${c.manager._id}/performance?year=${year}`), c.admin);
    expect(perf.statusCode).toBe(200);
    expect(perf.body.data.totals).toMatchObject({ posRevenue: 10000000, posOrders: 2 });
    expect(perf.body.data.totals.ordersHandled).toBeGreaterThanOrEqual(2);
    const days = Object.fromEntries(perf.body.data.daysByStore.map((d) => [d.name, d.days]));
    expect(days['CN B']).toBe(30);
    expect(days['CN A']).toBeGreaterThan(0);

    const summary = (await auth(request(app).get(`/api/staff/performance/summary?year=${year}`), c.admin)).body.data;
    expect(summary.find((s) => String(s._id) === String(c.manager._id)).totals.posRevenue).toBe(10000000);

    const review = (body) => auth(request(app).put(`/api/staff/${c.manager._id}/reviews/${year}`), c.admin).send(body);
    expect((await review({ rating: 6 })).statusCode).toBe(400);
    expect((await review({ rating: 4, bonus: -1 })).statusCode).toBe(400);
    const ok = await review({ rating: 4, bonus: 3000000, strengths: 'Bán hàng tốt' });
    expect(ok.body.data).toMatchObject({ rating: 4, bonus: 3000000 });
    expect(ok.body.data.metricsSnapshot.posRevenue).toBe(10000000);
    expect((await review({ rating: 5, bonus: 5000000 })).body.data.rating).toBe(5); // sửa lại, không tạo bản ghi mới

    // Chỉ admin
    const token = await c.login();
    expect((await auth(request(app).get(`/api/staff/${c.manager._id}/performance`), token)).statusCode).toBe(403);
    expect((await auth(request(app).post(`/api/staff/${c.manager._id}/transfers`), token).send({ storeId: c.storeB._id, months: 1 })).statusCode).toBe(403);
  });

  test('SW-4: Nhiều - nhiều: 1 nhân viên làm nhiều chi nhánh, 1 chi nhánh nhiều nhân viên; thêm / bớt từ phía chi nhánh', async () => {
    const c = await setup();
    const nv = await Admin.create({ name: 'NV Bán hàng', email: 'nvbh@example.com', password: 'abc12345', role: 'staff' });
    const add = (storeId, staffId) => auth(request(app).post(`/api/staff/by-store/${storeId}`), c.admin).send({ staffId });
    const remove = (storeId, staffId) => auth(request(app).delete(`/api/staff/by-store/${storeId}/${staffId}`), c.admin);
    const list = async (storeId) => (await auth(request(app).get(`/api/staff/by-store/${storeId}`), c.admin)).body.data;

    expect((await add(c.storeB._id, nv._id)).body.data.relation).toBe('home'); // chưa có chi nhánh -> chi nhánh chính
    expect((await add(c.storeC._id, nv._id)).body.data.relation).toBe('extra');
    expect((await add(c.storeC._id, nv._id)).statusCode).toBe(409);
    expect((await add(c.storeC._id, c.manager._id)).statusCode).toBe(201); // quản lý A cũng làm ở C

    const atC = await list(c.storeC._id);
    expect(atC.map((r) => `${r.name}:${r.relation}`).sort()).toEqual(['NV Bán hàng:extra', `${c.manager.name}:extra`].sort());
    expect((await list(c.storeA._id)).map((r) => r.relation)).toEqual(['home']);

    // Bỏ chi nhánh chính B -> C thành chi nhánh chính; không được bỏ chi nhánh cuối cùng
    expect((await remove(c.storeB._id, nv._id)).statusCode).toBe(200);
    expect(String((await Admin.findById(nv._id)).storeId)).toBe(String(c.storeC._id));
    const last = await remove(c.storeC._id, nv._id);
    expect(last.statusCode).toBe(400);
    expect(last.body.message).toMatch(/duy nhất/);
    expect((await remove(c.storeA._id, nv._id)).statusCode).toBe(400); // không làm ở A

    // Lịch sử ghi đủ các giai đoạn
    const history = (await auth(request(app).get(`/api/staff/${nv._id}/assignments`), c.admin)).body.data;
    expect(history.length).toBeGreaterThanOrEqual(3);
    // Thống kê chi nhánh C đếm cả người làm thêm
    const stores = (await auth(request(app).get('/api/stores/admin/all'), c.admin)).body.data;
    const statC = stores.find((s) => s.name === 'CN C').stats;
    expect(statC.staff + statC.managers).toBe(2);
  });
});
