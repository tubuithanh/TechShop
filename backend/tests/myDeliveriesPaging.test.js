// "Đơn tôi cần giao": phân trang + số đơn trên từng tab
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);

test('MD-1: tab cần xử lý / lịch sử phân trang 10 đơn, trả tổng số cả 2 tab', async () => {
  const store = await Store.create({ name: 'CN giao' });
  const group = await Group.create({ name: 'Ship', permissions: ['deliveries.perform'] });
  const shipper = await Admin.create({ name: 'Shipper', email: 'sp@t.vn', password: 'abc12345', role: 'staff', groupIds: [group._id], storeId: store._id });
  const base = { shipperId: shipper._id, storeId: store._id, items: [{ productId: shipper._id, quantity: 1, unitPrice: 1000, name: 'SP' }], deliveryAddress: { fullName: 'K', phone: '0900000000' }, deliveryMethod: 'home_delivery', paymentMode: 'cod', itemsTotal: 1000, grandTotal: 1000 };
  for (let i = 0; i < 13; i++) await Order.create({ ...base, orderCode: `DHA${i}`, status: 'shipping' });
  for (let i = 0; i < 4; i++) await Order.create({ ...base, orderCode: `DHH${i}`, status: 'delivered' });
  const token = (await request(app).post('/api/auth/login').send({ email: 'sp@t.vn', password: 'abc12345' })).body.accessToken;

  const p1 = (await auth(request(app).get('/api/deliveries/mine'), token)).body.data;
  expect(p1).toMatchObject({ view: 'active', page: 1, total: 13, totalPages: 2, counts: { active: 13, history: 4 } });
  expect(p1.active).toHaveLength(10);
  const p2 = (await auth(request(app).get('/api/deliveries/mine?page=2'), token)).body.data;
  expect(p2.active).toHaveLength(3);
  // Không trùng đơn giữa 2 trang
  expect(new Set([...p1.active, ...p2.active].map((o) => o.orderCode)).size).toBe(13);
  const h = (await auth(request(app).get('/api/deliveries/mine?view=history'), token)).body.data;
  expect(h).toMatchObject({ view: 'history', total: 4, totalPages: 1 });
  expect(h.history).toHaveLength(4);
  expect(h.active).toHaveLength(0);
});
