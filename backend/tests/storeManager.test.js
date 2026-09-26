require('./setup');
const request = require('supertest');
const app = require('../app');
const Store = require('../models/Store');
const Order = require('../models/Order');
const User = require('../models/User');
const { ensureStoreManager, STORE_MANAGER_ACCOUNT } = require('../seed/storeManager');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function setup() {
  const storeA = await Store.create({ name: 'Chi nhánh A' });
  const storeB = await Store.create({ name: 'Chi nhánh B' });
  const customer = await User.create({ displayName: 'Khách', email: 'khach@example.com', password: '123456' });
  const base = {
    userId: customer._id,
    items: [{ productId: customer._id, quantity: 1, unitPrice: 100000, name: 'SP' }],
    deliveryAddress: { fullName: 'Khách', phone: '0900000000' },
    paymentMode: 'cod',
    itemsTotal: 100000,
    grandTotal: 100000
  };
  const orderA = await Order.create({ ...base, orderCode: 'DHA1', storeId: storeA._id, status: 'delivered' });
  const orderB = await Order.create({ ...base, orderCode: 'DHB1', storeId: storeB._id, status: 'pending' });
  await ensureStoreManager(storeA);
  const token = (await request(app).post('/api/auth/login').send(STORE_MANAGER_ACCOUNT)).body.accessToken;
  return { storeA, storeB, orderA, orderB, token };
}

describe('Vai trò Quản lý cửa hàng', () => {
  test('TC-31: Chỉ thấy đơn hàng của chi nhánh mình (kể cả khi cố lọc chi nhánh khác)', async () => {
    const { storeB, token } = await setup();
    const list = await auth(request(app).get('/api/orders/admin/all'), token);
    expect(list.statusCode).toBe(200);
    expect(list.body.data.map((o) => o.orderCode)).toEqual(['DHA1']);
    const forced = await auth(request(app).get(`/api/orders/admin/all?storeId=${storeB._id}`), token);
    expect(forced.body.data.map((o) => o.orderCode)).toEqual(['DHA1']);
  });

  test('TC-32: Không xem/xử lý được đơn của chi nhánh khác', async () => {
    const { orderA, orderB, token } = await setup();
    expect((await auth(request(app).get(`/api/orders/${orderA._id}`), token)).statusCode).toBe(200);
    expect((await auth(request(app).get(`/api/orders/${orderB._id}`), token)).statusCode).toBe(403);
    const upd = await auth(request(app).put(`/api/orders/${orderB._id}/status`), token).send({ status: 'confirmed' });
    expect(upd.statusCode).toBe(403);
    expect((await Order.findById(orderB._id)).status).toBe('pending');
  });

  test('TC-33: Thống kê chỉ tính đơn/doanh thu của chi nhánh mình', async () => {
    const { token } = await setup();
    const summary = await auth(request(app).get('/api/dashboard/summary'), token);
    expect(summary.statusCode).toBe(200);
    expect(summary.body.data.totalOrders).toBe(1);
    expect(summary.body.data.totalRevenue).toBe(100000);
  });

  test('TC-34: Không có quyền ngoài phạm vi (sản phẩm, nhân viên, khách hàng)', async () => {
    const { token } = await setup();
    expect((await auth(request(app).post('/api/products'), token).send({ title: 'x' })).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/staff'), token)).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/users/admin/all'), token)).statusCode).toBe(403);
  });
});
