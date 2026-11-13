// Bảng điều phối giao hàng: tải công việc từng shipper, khu vực, hôm nay, COD đang giữ; lọc đơn theo shipper
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');

test('DSP-1: Bảng điều phối tính đúng tải, trạng thái, khu vực chờ; lọc đơn theo shipper', async () => {
  const store = await Store.create({ name: 'Q1' });
  const shipG = await Group.create({ name: 'Ship', permissions: ['deliveries.perform'] });
  const mgrG = await Group.create({ name: 'Mgr', permissions: ['deliveries.manage'] });
  const [a, b] = await Admin.create([
    { name: 'Shipper A', email: 'a-dsp@t.vn', password: 'abc12345', role: 'staff', groupIds: [shipG._id], storeId: store._id },
    { name: 'Shipper B', email: 'b-dsp@t.vn', password: 'abc12345', role: 'staff', groupIds: [shipG._id], storeId: store._id }
  ]);
  await Admin.create({ name: 'QL', email: 'ql-dsp@t.vn', password: 'abc12345', role: 'staff', groupIds: [mgrG._id], storeId: store._id });
  const token = (await request(app).post('/api/auth/login').send({ email: 'ql-dsp@t.vn', password: 'abc12345' })).body.accessToken;
  const mk = (extra) => Order.create({ orderCode: `D-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, deliveryMethod: 'home_delivery', paymentMode: 'cod',
    deliveryAddress: { fullName: 'K', phone: '0912345678', addressLine1: '1 A', addressLine2: 'Phường Bến Nghé', city: 'Hồ Chí Minh' },
    items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, unitPrice: 1000000 }], itemsTotal: 1000000, grandTotal: 1000000, ...extra });
  for (let i = 0; i < 3; i++) await mk({ status: 'shipping', shipperId: a._id });
  await mk({ status: 'delivered', shipperId: a._id, deliveryAttempts: [{ at: new Date(), result: 'success' }], codCollectedAt: new Date(), codSettledAt: null });
  await mk({ status: 'confirmed' });
  await mk({ status: 'confirmed', express: { deadline: new Date(Date.now() + 3600000) } });

  const res = await request(app).get('/api/deliveries/board').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  const d = res.body.data;
  expect(d.shippers.map((s) => s.name)).toEqual(['Shipper B', 'Shipper A']); // rảnh trước
  const A = d.shippers.find((s) => s.name === 'Shipper A');
  expect(A).toMatchObject({ load: 3, shipping: 3, status: 'busy', deliveredToday: 1, codHeld: 1, codHeldAmount: 1000000 });
  expect(A.areas[0]).toMatchObject({ area: 'Phường Bến Nghé, Hồ Chí Minh', n: 3 });
  expect(d.shippers.find((s) => s.name === 'Shipper B').status).toBe('free');
  expect(d.summary).toMatchObject({ pending: 2, expressPending: 1, shipping: 3, deliveredToday: 1, free: 1 });
  expect(d.pendingAreas[0]).toMatchObject({ area: 'Phường Bến Nghé, Hồ Chí Minh', n: 2 });

  const mine = await request(app).get(`/api/deliveries?view=assign&shipperId=${a._id}`).set('Authorization', `Bearer ${token}`);
  expect(mine.body.data).toHaveLength(3);
  expect(mine.body.data.every((o) => o.shipperId.name === 'Shipper A')).toBe(true);
});
