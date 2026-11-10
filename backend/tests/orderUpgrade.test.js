require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Group = require('../models/PermissionGroup');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Inventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const Transfer = require('../models/OrderTransfer');
const { flushEmails } = require('../utils/notifyEmail');
afterEach(flushEmails);
const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const token = a => jwt.sign({ id: String(a._id), role: a.role || 'customer' }, process.env.JWT_ACCESS_SECRET);
async function fixture() {
  await Promise.all([Order.init(), Transfer.init()]);
  const stores = await Store.create([{ name: 'Source' }, { name: 'Target' }, { name: 'Outside' }]);
  const group = await Group.create({ name: 'Orders', permissions: ['orders.manage', 'deliveries.manage', 'deliveries.perform', 'reviews.manage'] });
  const staff = [];
  for (let i = 0; i < 3; i++) staff.push(await Admin.create({ name: `Staff ${i}`, email: `staff${i}@test.vn`, password: '12345678', role: 'staff', storeId: stores[i]._id, groupIds: [group._id] }));
  const user = await User.create({ displayName: 'Customer', email: 'customer@test.vn', password: '12345678', phoneNumber: '0901234567' });
  const other = await User.create({ displayName: 'Other', email: 'other@test.vn', password: '12345678', phoneNumber: '0901234568' });
  const category = await Category.create({ name: 'Cat', slug: 'cat' });
  const product = await Product.create({ title: 'Phone', slug: 'phone', categoryId: category._id, price: 1, variants: [{ color: 'Black', price: 100000 }] });
  const variantId = product.variants[0]._id;
  await Inventory.create(stores.slice(0,2).map((s,i) => ({ storeId: s._id, productId: product._id, variantId, stock: i ? 10 : 9 })));
  const make = (extra = {}) => Order.create({ userId: user._id, storeId: stores[0]._id, orderCode: `TEST-${Date.now()}-${Math.random()}`, paymentMode: 'cod', itemsTotal: 100000, grandTotal: 130000, shippingFee: 30000, items: [{ productId: product._id, variantId, quantity: 1, unitPrice: 100000, name: 'Phone' }], deliveryAddress: { fullName: 'Customer', phone: '0901234567' }, ...extra });
  const order = await make();
  const send = (id = order._id, extra = {}) => auth(request(app).post(`/api/orders/${id}/transfer`), token(staff[0])).send({ toStoreId: String(stores[1]._id), reason: 'Balance stock', ...extra });
  const decide = (id, decision = 'accepted', who = 1) => auth(request(app).post(`/api/orders/admin/transfers/${id}/decision`), token(staff[who])).send({ decision });
  const stock = async i => (await Inventory.findOne({ storeId: stores[i]._id })).stock;
  return { stores, staff, user, other, product, order, make, send, decide, stock };
}
test('Customer pagination and status counts never include another customer orders', async () => {
  const c = await fixture();
  await c.make({ status: 'delivered' }); await c.make({ status: 'delivered' }); await c.make({ userId: c.other._id, status: 'delivered' });
  const get = q => auth(request(app).get(`/api/orders?${q}`),token(c.user));
  const first = await get('status=delivered&limit=1');
  expect(first.status).toBe(200); expect(first.body).toMatchObject({ total: 2, totalPages: 2, counts: { pending: 1, delivered: 2 } });
  const second = await get('status=delivered&limit=1&page=2');
  expect(second.body.data[0]._id).not.toBe(first.body.data[0]._id);
  expect((await get('status=invalid')).status).toBe(400);
});
test('Confirmation and receiver edits retain actor, branch, reason and before/after values', async () => {
  const c = await fixture();
  const confirmed = await auth(request(app).put(`/api/orders/${c.order._id}/status`),token(c.staff[0])).send({ status: 'confirmed' });
  expect(confirmed.status).toBe(200); expect(confirmed.body.data).toMatchObject({ confirmedByName: 'Staff 0', confirmedStoreName: 'Source' });
  const edit = body => auth(request(app).put(`/api/orders/${c.order._id}/info`),token(c.staff[0])).send(body);
  expect((await edit({ reason: 'Customer correction', note: 'Call first', deliveryAddress: { fullName: 'New name' } })).status).toBe(200);
  const saved = await Order.findById(c.order._id);
  expect(saved.statusHistory.at(-1).toObject()).toMatchObject({ actorName: 'Staff 0', changes: { 'deliveryAddress.fullName': { from: 'Customer', to: 'New name' } } });
  expect(saved.grandTotal).toBe(130000);
  const search = await auth(request(app).get('/api/orders/admin/all?q=New%20name'),token(c.staff[0]));
  expect(search.body.data.map(o => o._id)).toContain(String(c.order._id));
  expect((await auth(request(app).put(`/api/orders/${c.order._id}/info`),token(c.staff[2])).send({ note: 'X', reason: 'X' })).status).toBe(403);
});
test('Legacy confirmation resolves the saved actor ID without inventing a historical branch', async () => {
  const c = await fixture();
  await Order.updateOne({ _id: c.order._id }, { status: 'confirmed', statusHistory: [{ status: 'pending', changedBy: c.user._id }, { status: 'confirmed', changedBy: c.staff[0]._id }] });
  const r = await auth(request(app).get(`/api/orders/${c.order._id}`),token(c.user));
  expect(r.status).toBe(200);
  expect(r.body.data.confirmedByName).toBe('Staff 0');
  expect(r.body.data.confirmedStoreName).toBeUndefined();
  expect((await Order.findById(c.order._id)).confirmedAt).toBeUndefined();
});
test('Transfer acceptance is atomic, recipient scoped, blocks processing and restores only the new branch on cancellation', async () => {
  const c = await fixture();
  const sent = await c.send(); expect(sent.status).toBe(201);
  const id = sent.body.data._id;
  expect((await c.send()).status).toBe(409);
  expect((await c.decide(id,'accepted',0)).status).toBe(403);
  expect((await auth(request(app).put(`/api/orders/${c.order._id}/status`),token(c.staff[0])).send({ status: 'confirmed' })).status).toBe(409);
  expect((await auth(request(app).put(`/api/orders/${c.order._id}/cancel`),token(c.user)).send({})).status).toBe(409);
  const outside = await auth(request(app).get('/api/orders/admin/transfers'),token(c.staff[2])); expect(outside.body.data).toHaveLength(0);
  const decisions = await Promise.all([c.decide(id), c.decide(id)]);
  expect(decisions.filter(r => r.status === 200)).toHaveLength(1);
  expect(await c.stock(0)).toBe(10); expect(await c.stock(1)).toBe(9);
  const moved = await Order.findById(c.order._id); expect(String(moved.storeId)).toBe(String(c.stores[1]._id)); expect(moved.grandTotal).toBe(130000);
  expect((await auth(request(app).put(`/api/orders/${c.order._id}/cancel`),token(c.user)).send({})).status).toBe(200);
  expect(await c.stock(0)).toBe(10); expect(await c.stock(1)).toBe(10);
});
test('Insufficient target inventory rolls back every write; reject unlocks original order', async () => {
  const c = await fixture();
  const second = await Product.create({ title: 'Other phone', slug: 'other-phone', categoryId: c.product.categoryId, price: 1, variants: [{ color: 'Blue', price: 1 }] });
  await Order.updateOne({ _id: c.order._id }, { $push: { items: { productId: second._id, variantId: second.variants[0]._id, quantity: 1, unitPrice: 1 } } });
  const id = (await c.send()).body.data._id;
  expect((await c.decide(id)).status).toBe(409);
  expect(await c.stock(0)).toBe(9); expect(await c.stock(1)).toBe(10);
  expect((await Transfer.findById(id)).status).toBe('pending');
  expect((await c.decide(id,'rejected')).status).toBe(200);
  expect((await Order.findById(c.order._id)).activeTransferId).toBeNull();
});
test('Pickup changes require customer consent and orders already shipping cannot transfer', async () => {
  const c = await fixture();
  await Order.updateOne({ _id: c.order._id }, { deliveryMethod: 'store_pickup' });
  expect((await c.send()).status).toBe(400);
  expect((await c.send(c.order._id,{ customerConsent: true })).status).toBe(201);
  const shipping = await c.make({ status: 'shipping' });
  expect((await c.send(shipping._id)).status).toBe(409);
});

test('Multi-branch managers can decide for managed branches; outsiders and customers cannot mutate transfers', async () => {
  const c = await fixture();
  const id = (await c.send()).body.data._id;
  const incoming = await auth(request(app).get('/api/orders/admin/transfers'),token(c.staff[1]));
  expect(incoming.body.data[0]).toMatchObject({ canDecide: true, canCancel: false });
  expect((await c.decide(id, 'accepted', 2)).status).toBe(403);
  expect((await auth(request(app).post(`/api/orders/admin/transfers/${id}/decision`),token(c.user)).send({ decision: 'accepted' })).status).toBe(403);
  await Admin.updateOne({ _id: c.staff[0]._id }, { managedStoreIds: [c.stores[1]._id] });
  expect((await c.decide(id, 'accepted', 0)).status).toBe(200);
});

test('Transfers clear confirmation and assignment, preserve price snapshots, and require confirmation at the new branch', async () => {
  const c = await fixture();
  await auth(request(app).put(`/api/orders/${c.order._id}/status`),token(c.staff[0])).send({ status: 'confirmed' });
  await Order.updateOne({ _id: c.order._id }, { shipperId: c.staff[0]._id, vat: { amount: 10000 }, promotionDiscount: 1200 });
  const id = (await c.send()).body.data._id;
  expect((await auth(request(app).put(`/api/deliveries/${c.order._id}/assign`),token(c.staff[0])).send({ shipperId: String(c.staff[0]._id) })).status).toBe(409);
  expect((await auth(request(app).put(`/api/orders/${c.order._id}/info`),token(c.staff[0])).send({ note: 'Edit while locked', reason: 'X' })).status).toBe(409);
  expect((await c.decide(id)).status).toBe(200);
  const moved = await Order.findById(c.order._id);
  expect(moved.toObject()).toMatchObject({ status: 'pending', shipperId: null, confirmedAt: null, vat: { amount: 10000 }, promotionDiscount: 1200, grandTotal: 130000 });
  expect(moved.statusHistory.some(h => h.actorName === 'Staff 0' && h.status === 'confirmed')).toBe(true);
  const confirm = who => auth(request(app).put(`/api/orders/${c.order._id}/status`),token(c.staff[who])).send({ status: 'confirmed' });
  expect((await confirm(0)).status).toBe(403);
  const confirmed = await confirm(1);
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data).toMatchObject({ confirmedByName: 'Staff 1', confirmedStoreName: 'Target' });
});

test('Source can cancel a transfer without moving stock; unpaid online orders cannot transfer', async () => {
  const c = await fixture();
  const id = (await c.send()).body.data._id;
  expect((await c.decide(id, 'cancelled', 1)).status).toBe(403);
  expect((await c.decide(id, 'cancelled', 0)).status).toBe(200);
  expect(await c.stock(0)).toBe(9); expect(await c.stock(1)).toBe(10);
  await Order.updateOne({ _id: c.order._id }, { paymentMode: 'vnpay' });
  expect((await c.send()).status).toBe(409);
  await Order.updateOne({ _id: c.order._id }, { paymentStatus: 'paid' });
  expect((await c.send()).status).toBe(201);
});

test('Edits cannot change financial fields and confirmation snapshots survive account renames', async () => {
  const c = await fixture();
  await auth(request(app).put(`/api/orders/${c.order._id}/status`),token(c.staff[0])).send({ status: 'confirmed' });
  const edit = body => auth(request(app).put(`/api/orders/${c.order._id}/info`),token(c.staff[0])).send(body);
  expect((await edit({ note: 'Changed' })).status).toBe(400);
  expect((await edit({ reason: 'Correction', grandTotal: 1, storeId: String(c.stores[1]._id), note: 'Call first' })).status).toBe(200);
  await Admin.updateOne({ _id: c.staff[0]._id }, { name: 'Renamed staff' });
  const got = await auth(request(app).get(`/api/orders/${c.order._id}`),token(c.user));
  expect(got.body.data).toMatchObject({ confirmedByName: 'Staff 0', grandTotal: 130000, storeId: { _id: String(c.stores[0]._id) } });
  expect(got.body.data.statusHistory.at(-1)).toMatchObject({ actorName: 'Staff 0', eventType: 'activity' });
});

test('Activity logs never change warranty purchase dates or legacy confirmation timestamps', async () => {
  const c = await fixture();
  const deliveredAt = new Date('2026-01-01');
  const { deliveredDate } = require('../utils/warrantyCards');
  expect(deliveredDate({ statusHistory: [
    { status: 'delivered', changedAt: deliveredAt },
    { status: 'delivered', eventType: 'activity', changedAt: new Date('2026-02-01') }
  ] })).toEqual(deliveredAt);
  await Order.updateOne({ _id: c.order._id }, { status: 'confirmed', statusHistory: [
    { status: 'confirmed', changedBy: c.staff[0]._id, changedAt: deliveredAt },
    { status: 'confirmed', eventType: 'activity', actorName: 'Another staff', changedAt: new Date('2026-02-01') }
  ] });
  const got = await auth(request(app).get(`/api/orders/${c.order._id}`),token(c.user));
  expect(got.body.data.confirmedAt).toBe(deliveredAt.toISOString());
  expect(got.body.data.confirmedByName).toBe('Staff 0');
});

test('Staff performance keeps the branch where confirmation happened after transferring the order', async () => {
  const c = await fixture();
  await auth(request(app).put(`/api/orders/${c.order._id}/status`),token(c.staff[0])).send({ status: 'confirmed' });
  const id = (await c.send()).body.data._id;
  expect((await c.decide(id)).status).toBe(200);
  const other = await c.make();
  await auth(request(app).put(`/api/orders/${other._id}/info`),token(c.staff[0])).send({ reason: 'Note only', note: 'Call first' });
  const admin = await Admin.create({ name: 'Admin', email: 'root@test.vn', password: '12345678', role: 'admin' });
  const perf = await auth(request(app).get(`/api/staff/${c.staff[0]._id}/performance?year=${new Date().getFullYear()}`),token(admin));
  expect(perf.status).toBe(200);
  expect(perf.body.data.totals.ordersHandled).toBe(1);
  expect(perf.body.data.byStore).toEqual(expect.arrayContaining([expect.objectContaining({ storeId: String(c.stores[0]._id), ordersHandled: 1 })]));
});
