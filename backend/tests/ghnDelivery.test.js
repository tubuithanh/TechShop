jest.mock('../utils/ghn', () => ({ locations: jest.fn(), shopFor: jest.fn(), create: jest.fn(), detail: jest.fn(), cancel: jest.fn() }));
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
const ghn = require('../utils/ghn');
const routing = require('../utils/deliveryRouting');
let distance;
beforeEach(() => {
  process.env.SHIPPING_PROVIDER = 'ghn_sandbox';
  jest.clearAllMocks();
  distance = jest.spyOn(routing, 'roadDistance').mockResolvedValue({ distanceMeters: 20000, durationSeconds: 1000, routingProvider: 'OSRM', calculatedAt: new Date() });
  ghn.locations.mockImplementation(async (kind, parent) => kind === 'provinces'
    ? [{ ProvinceID: 202, ProvinceName: 'Ho Chi Minh' }, { ProvinceID: 201, ProvinceName: 'Ha Noi' }]
    : kind === 'districts' ? [{ DistrictID: Number(parent) === 202 ? 1442 : 1485, DistrictName: 'District' }]
    : [{ WardCode: '20101', WardName: 'Ward' }]);
  ghn.shopFor.mockResolvedValue({ _id: 237649 });
  ghn.create.mockResolvedValue({ order_code: 'TEST-GHN-001', total_fee: 25000, expected_delivery_time: '2026-12-01T00:00:00Z' });
  ghn.detail.mockResolvedValue({ order_code: 'TEST-GHN-001', status: 'ready_to_pick' });
  ghn.cancel.mockResolvedValue([{ order_code: 'TEST-GHN-001', result: true }]);
});
afterEach(() => { jest.restoreAllMocks(); delete process.env.SHIPPING_PROVIDER; });
async function setup() {
  const c = await fixture();
  await Store.updateOne({ _id: c.stores[0]._id }, { city: 'Ho Chi Minh', lat: 10.7769, lng: 106.7009 });
  await Order.updateOne({ _id: c.order._id }, { status: 'processing', 'deliveryAddress.city': 'Ho Chi Minh', 'deliveryAddress.addressLine1': '123 Street' });
  const api = (method, path, body = {}, actor = c.staff[0]) => auth(request(app)[method](`/api/deliveries/${c.order._id}/${path}`), token(actor)).send(body);
  const plan = (body = {}) => api('put', 'plan', { provinceId: 202, districtId: 1442, wardCode: '20101', lat: 10.78, lng: 106.7, addressVerified: true, ...body });
  const carrier = async () => { distance.mockResolvedValue({ distanceMeters: 21000, durationSeconds: 1100, routingProvider: 'OSRM' }); expect((await plan()).status).toBe(200); };
  const create = body => api('post', 'shipment', body || { weight: 500, length: 20, width: 15, height: 10 });
  return { ...c, api, plan, carrier, create };
}

test('Road boundary is exactly 20km; express requires same province and a verified address', async () => {
  const c = await setup();
  expect((await c.plan({ addressVerified: false })).status).toBe(400);
  const express = await c.plan({ express: true });
  expect(express.status).toBe(200); expect(express.body.data.deliveryPlan).toMatchObject({ mode: 'express', distanceMeters: 20000 });
  expect(distance).toHaveBeenCalledWith(expect.objectContaining({ lat: 10.7769 }), { lat: 10.78, lng: 106.7 });
  distance.mockResolvedValue({ distanceMeters: 20000.1 });
  expect((await c.plan({ express: true })).status).toBe(400);
  expect((await c.plan()).body.data.deliveryPlan.mode).toBe('ghn');
  await Order.updateOne({ _id: c.order._id }, { 'deliveryAddress.city': 'Ha Noi' });
  distance.mockClear();
  expect((await c.plan({ provinceId: 201, districtId: 1485 })).body.data.deliveryPlan.mode).toBe('ghn');
  expect(distance).not.toHaveBeenCalled();
  expect((await c.plan({ provinceId: 201, districtId: 1485, express: true })).status).toBe(400);
});

test('Wrong province, routing failure and wrong branch never bypass delivery verification', async () => {
  const c = await setup();
  expect((await c.plan({ provinceId: 201, districtId: 1485 })).status).toBe(400);
  expect((await c.api('put', 'plan', {}, c.user)).status).toBe(403);
  expect((await c.api('put', 'plan', {}, c.staff[1])).status).toBe(403);
  distance.mockRejectedValue(new (require('../utils/transaction').BusinessError)(503, 'No route'));
  expect((await c.plan()).status).toBe(503);
  expect((await c.api('put', 'assign', { shipperId: String(c.staff[0]._id) })).status).toBe(200);
});

test('Only a shipper working at the source branch can be assigned, including temporary staff transfers', async () => {
  const c = await setup(); await c.plan();
  expect((await c.api('put', 'assign', { shipperId: String(c.staff[1]._id) })).status).toBe(400);
  await Admin.updateOne({ _id: c.staff[1]._id }, { managedStoreIds: [c.stores[0]._id] });
  expect((await c.api('put', 'assign', { shipperId: String(c.staff[1]._id) })).status).toBe(400);
  await require('../models/StaffAssignment').create({ staffId: c.staff[1]._id, storeId: c.stores[0]._id, kind: 'transfer', startDate: new Date(Date.now() - 1000) });
  expect((await c.api('put', 'assign', { shipperId: String(c.staff[1]._id) })).status).toBe(200);
  await Admin.updateOne({ _id: c.staff[0]._id }, { storeId: null });
  expect((await c.api('put', 'assign', { shipperId: String(c.staff[0]._id) })).status).toBe(400);
});

test('Creating GHN is idempotent, snapshots COD, does not ship immediately or change stock/prices', async () => {
  const c = await setup(); await c.carrier();
  const [a,b] = await Promise.all([c.create(), c.create()]);
  expect([a.status,b.status]).toContain(201);
  expect(ghn.create).toHaveBeenCalledTimes(1);
  expect(ghn.create.mock.calls[0][1]).toMatchObject({ payment_type_id: 1, cod_amount: 130000 });
  const saved = await Order.findById(c.order._id);
  expect(saved.toObject()).toMatchObject({ status: 'processing', grandTotal: 130000, shipment: { code: 'TEST-GHN-001', phase: 'active', environment: 'sandbox' } });
  expect(await c.stock(0)).toBe(9);
  expect((await c.create()).status).toBe(200);
  expect(ghn.create).toHaveBeenCalledTimes(1);
  expect((await c.api('put', 'assign', { shipperId: String(c.staff[0]._id) })).status).toBe(409);
  expect((await c.send()).status).toBe(409);
  const tracking = await c.api('get', 'tracking', {}, c.user);
  expect(tracking.status).toBe(200);
  expect(tracking.body.data.shipment.request).toBeUndefined();
  expect((await c.api('get', 'tracking', {}, c.other)).status).toBe(403);
});

test('Ambiguous timeout keeps the order locked; retry reuses the original immutable request', async () => {
  const c = await setup(); await c.carrier();
  ghn.create.mockRejectedValueOnce(new (require('../utils/transaction').BusinessError)(502, 'Timeout'));
  expect((await c.create()).status).toBe(502);
  expect((await Order.findById(c.order._id)).shipment.phase).toBe('unknown');
  expect((await c.send()).status).toBe(409);
  expect((await auth(request(app).put(`/api/orders/${c.order._id}/cancel`),token(c.user)).send({})).status).toBe(409);
  expect((await c.create({ weight: 900, length: 30, width: 25, height: 10 })).status).toBe(201);
  expect(ghn.create.mock.calls[1]).toEqual(ghn.create.mock.calls[0]);
});

test('Paid orders have zero COD; explicit GHN rejection unlocks without touching inventory', async () => {
  const c = await setup(); await c.carrier();
  await Order.updateOne({ _id: c.order._id }, { paymentStatus: 'paid', paymentMode: 'vnpay' });
  const err = new (require('../utils/transaction').BusinessError)(502, 'GHN rejected'); err.definite = true;
  ghn.create.mockRejectedValueOnce(err);
  expect((await c.create()).status).toBe(502);
  expect((await Order.findById(c.order._id)).shipment.phase).toBe('failed');
  expect(ghn.create.mock.calls[0][1].cod_amount).toBe(0);
  expect(await c.stock(0)).toBe(9);
});

test('GHN delivered sync is idempotent, separate from internal COD, and returns require warehouse receipt', async () => {
  const c = await setup(); await c.carrier(); await c.create();
  ghn.detail.mockResolvedValue({ order_code: 'TEST-GHN-001', status: 'delivered' });
  expect((await c.api('post', 'shipment/sync')).status).toBe(200);
  expect((await c.api('post', 'shipment/sync')).status).toBe(200);
  let saved = await Order.findById(c.order._id);
  expect(saved.toObject()).toMatchObject({ status: 'delivered', paymentStatus: 'paid', receipt: { channel: 'ghn', amount: 130000 } });
  expect(saved.codCollectedAt).toBeUndefined();
  expect(saved.statusHistory.filter(h => h.status === 'delivered' && h.eventType === 'status')).toHaveLength(1);
  expect((await Product.findById(c.product._id)).soldCount).toBe(1);
  expect((await c.api('post', 'shipment/settle', { reference: 'SANDBOX-RECONCILIATION-1' })).status).toBe(200);
  expect((await c.api('post', 'shipment/settle', { reference: 'DUPLICATE' })).status).toBe(409);
  ghn.detail.mockResolvedValue({ order_code: 'TEST-GHN-001', status: 'returning' });
  expect((await c.api('post', 'shipment/sync')).status).toBe(200);
  expect((await c.api('post', 'receive-return', { received: true })).status).toBe(409);
  ghn.detail.mockResolvedValue({ order_code: 'TEST-GHN-001', status: 'returned' });
  expect((await c.api('post', 'shipment/sync')).status).toBe(200);
  expect(await c.stock(0)).toBe(9);
  expect((await c.api('post', 'receive-return', { received: true })).status).toBe(200);
  expect(await c.stock(0)).toBe(10);
  expect((await Product.findById(c.product._id)).soldCount).toBe(0);
});

test('Cancelling a shipment alone never cancels or restocks the sales order; failed cancellation stays locked', async () => {
  const c = await setup(); await c.carrier(); await c.create();
  ghn.cancel.mockResolvedValueOnce([{ order_code: 'TEST-GHN-001', result: false }]);
  expect((await c.api('post', 'shipment/cancel')).status).toBe(409);
  expect((await Order.findById(c.order._id)).shipment.phase).toBe('active');
  expect((await c.api('post', 'shipment/cancel')).status).toBe(200);
  expect((await Order.findById(c.order._id)).status).toBe('processing');
  expect(await c.stock(0)).toBe(9);
  expect((await c.send()).status).toBe(201);
});
