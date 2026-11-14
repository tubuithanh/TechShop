// Giao hỏa tốc: quản lý mở khung giờ + chọn sản phẩm + bán kính; khách trong phạm vi đặt -> tự xác nhận, tự phân công
// shipper, phụ phí hỏa tốc; ngoài bán kính / sản phẩm không thuộc danh sách / hết suất -> từ chối
process.env.ROUTING_API_URL = 'http://127.0.0.1:9'; // không có dịch vụ bản đồ -> dùng khoảng cách ước lượng
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Inventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const ExpressWindow = require('../models/ExpressWindow');
const { registerUser } = require('./helpers');
const { flushEmails } = require('../utils/notifyEmail');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
afterEach(flushEmails);
const HOME = { lat: 10.7769, lng: 106.7009 };       // trung tâm Q1
const NEAR = { lat: 10.7800, lng: 106.6950 };       // ~0,7 km
const FAR = { lat: 10.9500, lng: 106.8200 };        // ~23 km

async function fixture() {
  await Order.init();
  const category = await Category.create({ name: 'ĐT', slug: `dt-${Math.random()}` });
  const [fast, slow] = await Product.create([
    { title: 'Máy hỏa tốc', slug: `f-${Math.random()}`, categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000000 }] },
    { title: 'Máy thường', slug: `s-${Math.random()}`, categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 500000 }] }
  ]);
  const store = await Store.create({ name: 'Q1', city: 'Hồ Chí Minh', ...HOME });
  for (const p of [fast, slow]) await Inventory.create({ storeId: store._id, productId: p._id, variantId: p.variants[0]._id, stock: 5 });
  const shipGroup = await Group.create({ name: 'Ship', permissions: ['deliveries.perform'] });
  const mgrGroup = await Group.create({ name: 'Mgr', permissions: ['deliveries.manage', 'orders.manage'] });
  const shipper = await Admin.create({ name: 'Shipper A', email: `s-${Math.random()}@t.vn`, password: 'abc12345', role: 'staff', groupIds: [shipGroup._id], storeId: store._id });
  const mgr = await Admin.create({ name: 'QL', email: 'ql-exp@t.vn', password: 'abc12345', role: 'staff', groupIds: [mgrGroup._id], storeId: store._id });
  const mgrToken = (await request(app).post('/api/auth/login').send({ email: mgr.email, password: 'abc12345' })).body.accessToken;
  const reg = (await registerUser()).body;
  const addToCart = (p, q = 1) => auth(request(app).post('/api/cart/items'), reg.accessToken).send({ productId: p._id, variantId: p.variants[0]._id, quantity: q });
  const openWindow = (body = {}) => auth(request(app).post('/api/express/admin'), mgrToken).send({
    startAt: new Date(Date.now() - 60000), endAt: new Date(Date.now() + 3 * 3600000), radiusKm: 10, fee: 30000, productIds: [String(fast._id)], ...body
  });
  const order = (point, extra = {}) => auth(request(app).post('/api/orders'), reg.accessToken).send({
    storeId: String(store._id), deliveryMethod: 'home_delivery', paymentMode: 'cod',
    deliveryAddress: { fullName: 'Khách', phone: '0912345678', addressLine1: '1 Lê Lợi', city: 'Hồ Chí Minh' }, express: point, ...extra
  });
  return { fast, slow, store, shipper, mgrToken, reg, addToCart, openWindow, order };
}

test('EXP-1: Khách trong bán kính đặt sản phẩm hỏa tốc -> tự xác nhận, tự phân công shipper, cộng phụ phí, hạn 2 giờ', async () => {
  const c = await fixture();
  const w = (await c.openWindow()).body.data;
  expect((await request(app).get('/api/express/active')).body.data[0]).toMatchObject({ fee: 30000, radiusKm: 10, store: { name: 'Q1' } });

  await c.addToCart(c.fast);
  const ok = (await auth(request(app).post('/api/express/check'), c.reg.accessToken).send(NEAR)).body.data;
  expect(ok).toMatchObject({ ok: true, fee: 30000, store: { name: 'Q1' } });
  expect(ok.distanceKm).toBeLessThan(2);
  const far = (await auth(request(app).post('/api/express/check'), c.reg.accessToken).send(FAR)).body.data;
  expect(far.ok).toBe(false);

  const res = await c.order({ ...NEAR, windowId: w._id });
  expect(res.status).toBe(201);
  const o = await Order.findById(res.body.data._id);
  expect(o.status).toBe('confirmed');
  expect(String(o.shipperId)).toBe(String(c.shipper._id));
  expect(o.deliveryPlan.mode).toBe('express');
  expect(o.express.fee).toBe(30000);
  expect(o.shippingFee).toBeGreaterThanOrEqual(30000);
  const minutes = (o.express.deadline - Date.now()) / 60000;
  expect(minutes).toBeGreaterThan(115);
  expect(minutes).toBeLessThanOrEqual(120);
  expect(o.assignmentLog[0]).toMatchObject({ byName: 'Hệ thống (hỏa tốc)', shipperName: 'Shipper A' });
  expect((await ExpressWindow.findById(w._id)).ordersCount).toBe(1);
});

test('EXP-2: Từ chối khi ngoài bán kính, giỏ có sản phẩm không thuộc danh sách, hoặc khung giờ hết suất', async () => {
  const c = await fixture();
  const w = (await c.openWindow({ maxOrders: 1 })).body.data;
  await c.addToCart(c.fast);
  expect((await c.order({ ...FAR, windowId: w._id })).status).toBe(400);
  await c.addToCart(c.slow);
  const mixed = await c.order({ ...NEAR, windowId: w._id });
  expect(mixed.status).toBe(400);
  expect(mixed.body.message).toMatch(/không thuộc danh sách/);
  expect((await ExpressWindow.findById(w._id)).ordersCount).toBe(0); // trả suất khi không đặt được

  // Quản lý không mở được khung cho chi nhánh khác / bán kính > 20 km
  expect((await c.openWindow({ radiusKm: 25 })).status).toBe(400);
});

test('EXP-3: Khách hủy đơn hỏa tốc -> trả lại suất; khách không tự hủy được khi cửa hàng đang chuẩn bị hàng', async () => {
  const c = await fixture();
  const w = (await c.openWindow({ maxOrders: 1 })).body.data;
  await c.addToCart(c.fast);
  const o = (await c.order({ ...NEAR, windowId: w._id })).body.data;
  expect((await ExpressWindow.findById(w._id)).ordersCount).toBe(1);

  // Đang chuẩn bị -> khách không tự hủy (nhân viên vẫn hủy được)
  await Order.updateOne({ _id: o._id }, { status: 'processing' });
  const blocked = await auth(request(app).put(`/api/orders/${o._id}/cancel`), c.reg.accessToken).send({ reason: 'Đổi ý' });
  expect(blocked.status).toBe(400);
  expect(blocked.body.message).toMatch(/liên hệ cửa hàng/);

  await Order.updateOne({ _id: o._id }, { status: 'confirmed' });
  const ok = await auth(request(app).put(`/api/orders/${o._id}/cancel`), c.reg.accessToken).send({ reason: { $ne: 1 } }); // lý do sai kiểu -> dùng mặc định
  expect(ok.status).toBe(200);
  expect(ok.body.data.cancelReason).toBe('Khách hàng yêu cầu hủy');
  expect((await ExpressWindow.findById(w._id)).ordersCount).toBe(0); // suất được trả lại

  // Nhân viên hủy đơn phải có lý do
  await c.addToCart(c.fast);
  const o2 = (await c.order({ ...NEAR, windowId: w._id })).body.data;
  expect((await auth(request(app).put(`/api/orders/${o2._id}/status`), c.mgrToken).send({ status: 'cancelled' })).status).toBe(400);
});
