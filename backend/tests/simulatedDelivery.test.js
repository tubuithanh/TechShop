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
  delete process.env.SHIPPING_PROVIDER;
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
  const api = async (method, path, body = {}, actor = c.staff[0]) => {
    if (path === 'shipment/advance' && ['picked','delivered'].includes(body.status) && body.evidenceIds === undefined) {
      const o = await Order.findById(c.order._id);
      const proof = await require('../models/DeliveryEvidence').create({orderId:o._id,uploadedBy:actor._id,carrierCode:o.shipment.code,carrierStage:body.status,expiresAt:new Date(Date.now()+60000),data:Buffer.from('test'),mimeType:'image/png'});
      body = {...body,evidenceIds:[String(proof._id)]};
    }
    return auth(request(app)[method](`/api/deliveries/${c.order._id}/${path}`), token(actor)).send(body);
  };
  const plan = (body = {}) => api('put', 'plan', { provinceId: 202, districtId: 1442, wardCode: '20101', lat: 10.78, lng: 106.7, addressVerified: true, ...body });
  const carrier = async () => { distance.mockResolvedValue({ distanceMeters: 21000, durationSeconds: 1100, routingProvider: 'OSRM' }); expect((await plan()).status).toBe(200); };
  const create = body => api('post', 'shipment', body || { weight: 500, length: 20, width: 15, height: 10 });
  return { ...c, api, plan, carrier, create };
}

test('Simulation uses no GHN API, allows all branches and preserves 20km road boundary', async () => {
  const c = await setup();
  expect((await c.plan({ express: true })).body.data.deliveryPlan.mode).toBe('express');
  distance.mockResolvedValue({ distanceMeters: 20001 });
  expect((await c.plan({ express: true })).status).toBe(400);
  expect((await c.plan()).body.data.deliveryPlan.mode).toBe('ghn');
  await Order.updateOne({ _id: c.order._id }, { 'deliveryAddress.city': 'Ha Noi' });
  distance.mockClear();
  expect((await c.plan()).body.data.deliveryPlan.sameProvince).toBe(false);
  expect(distance).not.toHaveBeenCalled();
  const created = await c.create();
  expect(created.status).toBe(201);
  expect(created.body.data.shipment).toMatchObject({ environment: 'simulation', codAmount: 130000, status: 'ready_to_pick' });
  expect(created.body.data.shipment.code).toMatch(/^GHN-DEMO-[A-F0-9]{32}$/);
  expect(created.body.data.status).toBe('processing');
  expect(await c.stock(0)).toBe(9);
  expect((await c.create()).body.data.shipment.code).toBe(created.body.data.shipment.code);
  for (const fn of Object.values(ghn)) expect(fn).not.toHaveBeenCalled();
});

test('Public link exposes only tracking, customers cannot change states and branches stay isolated', async () => {
  const c = await setup(); await c.carrier();
  const created = await c.create(), code = created.body.data.shipment.code;
  const url = `/api/deliveries/track/${code}`;
  const r = await request(app).get(url);
  expect(r.status).toBe(200);
  expect(Object.keys(r.body.data).sort()).toEqual(['carrier','code','destination','environment','events','expectedDeliveryTime','status','updatedAt','photos'].sort());
  expect(JSON.stringify(r.body)).not.toMatch(/Customer|0901234567|130000|123 Street/);
  expect((await request(app).get('/api/deliveries/track/GHN-DEMO-FAKE')).status).toBe(404);
  expect((await c.api('post','shipment/advance',{ status:'picked',previousStatus:'ready_to_pick' },c.user)).status).toBe(403);
  expect((await c.api('post','shipment/advance',{ status:'picked',previousStatus:'ready_to_pick' },c.staff[1])).status).toBe(403);
  await request(app).get(url); await c.api('post', 'shipment/sync');
  expect((await Order.findById(c.order._id)).shipment.status).toBe('ready_to_pick');
  expect(ghn.detail).not.toHaveBeenCalled();
});

test('Sequential delivery, stale/concurrent actions, success and COD are applied once', async () => {
  const c = await setup(); await c.carrier(); await c.create();
  const advance = (previousStatus,status,note) => c.api('post','shipment/advance',{previousStatus,status,note});
  expect((await advance('ready_to_pick','delivered')).status).toBe(409);
  const both = await Promise.all([advance('ready_to_pick','picked'),advance('ready_to_pick','picked')]);
  expect(both.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await c.api('post','shipment/cancel')).status).toBe(409);
  expect((await advance('picked','transporting')).status).toBe(200);
  expect((await advance('transporting','delivering')).status).toBe(200);
  expect((await advance('delivering','delivery_fail')).status).toBe(400);
  expect((await advance('delivering','delivery_fail','Nobody home')).status).toBe(200);
  expect((await advance('delivery_fail','delivering')).status).toBe(200);
  expect((await advance('delivering','delivered')).status).toBe(200);
  expect((await advance('delivering','delivered')).status).toBe(409);
  const order = await Order.findById(c.order._id);
  expect(order.toObject()).toMatchObject({ status:'delivered',paymentStatus:'paid',receipt:{ channel:'ghn',amount:130000 } });
  expect(order.shipment.events.filter(e=>e.status==='delivered')).toHaveLength(1);
  expect((await Product.findById(c.product._id)).soldCount).toBe(1);
  expect((await c.api('post','shipment/settle',{reference:'DEMO-1'})).status).toBe(200);
  expect((await c.api('post','shipment/settle',{reference:'DEMO-2'})).status).toBe(409);
});

test('Failed delivery and return do not restock until warehouse confirms receipt', async () => {
  const c = await setup(); await c.carrier(); await c.create();
  let previousStatus='ready_to_pick';
  for(const status of ['picked','transporting','delivering','delivery_fail','returning','returned']) {
    const r=await c.api('post','shipment/advance',{previousStatus,status,note:'Customer refused'});
    expect(r.status).toBe(200); previousStatus=status;
  }
  expect((await Order.findById(c.order._id)).status).toBe('returning');
  expect(await c.stock(0)).toBe(9);
  expect((await c.api('post','receive-return',{received:true})).status).toBe(200);
  expect(await c.stock(0)).toBe(10);
  expect((await c.api('post','receive-return',{received:true})).status).toBe(400);
  expect(await c.stock(0)).toBe(10);
});

test('Cancel before pickup preserves stock; paid orders collect no COD; legacy unknown can retire explicitly', async () => {
  const c = await setup(); await c.carrier();
  await Order.updateOne({_id:c.order._id},{paymentStatus:'paid',paymentMode:'vnpay',shipment:{environment:'sandbox',phase:'unknown',clientCode:'OLD'}});
  expect((await c.create()).status).toBe(409);
  expect((await c.api('post','shipment/retire-sandbox')).status).toBe(200);
  expect((await c.create()).body.data.shipment.codAmount).toBe(0);
  expect((await c.api('post','shipment/cancel')).status).toBe(200);
  const order=await Order.findById(c.order._id);
  expect(order.status).toBe('processing'); expect(order.shipment.phase).toBe('cancelled');
  expect(await c.stock(0)).toBe(9);
  expect(ghn.cancel).not.toHaveBeenCalled();
});

test('Simple dispatch lets manager choose shop delivery across provinces without a route check', async () => {
  const c = await setup();
  await Order.updateOne({ _id: c.order._id }, { 'deliveryAddress.city': 'Ha Noi' });
  expect((await c.api('post','dispatch',{method:'internal',shipperId:String(c.staff[1]._id)})).status).toBe(400);
  expect((await c.api('post','dispatch',{method:'internal',shipperId:String(c.staff[0]._id)},c.staff[1])).status).toBe(403);
  const r=await c.api('post','dispatch',{method:'internal',shipperId:String(c.staff[0]._id)});
  expect(r.status).toBe(200);
  expect(r.body.data.deliveryPlan).toMatchObject({mode:'internal',assignmentMode:'manager_choice'});
  expect(distance).not.toHaveBeenCalled();
  expect((await c.api('post','pickup')).status).toBe(200);
  expect((await c.api('post','dispatch',{method:'ghn'})).status).toBe(409);
});

test('One confirmation creates a carrier shipment without parcel or route input; no duplicate dispatch', async () => {
  const c=await setup();
  const both=await Promise.all([c.api('post','dispatch',{method:'ghn'}),c.api('post','dispatch',{method:'ghn'})]);
  expect(both.map(r=>r.status).sort()).toEqual([200,409]);
  const order=await Order.findById(c.order._id);
  expect(order.shipment.code).toMatch(/^GHN-DEMO-[A-F0-9]{32}$/);
  expect(order.status).toBe('processing');
  expect(await c.stock(0)).toBe(9);
  expect((await request(app).get(`/api/deliveries/track/${order.shipment.code}`)).status).toBe(200);
  expect(distance).not.toHaveBeenCalled();
  expect(ghn.create).not.toHaveBeenCalled();
});

test('Preassignment does not hand over unprepared goods or bypass payment requirements', async () => {
  const c=await setup();
  await Order.updateOne({_id:c.order._id},{status:'confirmed',paymentMode:'vnpay',paymentStatus:'unpaid'});
  expect((await c.api('post','dispatch',{method:'ghn'})).status).toBe(400);
  await Order.updateOne({_id:c.order._id},{paymentStatus:'paid'});
  expect((await c.api('post','dispatch',{method:'ghn'})).status).toBe(200);
  expect((await c.api('post','shipment/advance',{previousStatus:'ready_to_pick',status:'picked'})).status).toBe(409);
  expect((await Order.findById(c.order._id)).status).toBe('confirmed');
  const prepared = await auth(request(app).put(`/api/orders/${c.order._id}/status`), token(c.staff[0])).send({status:'processing'});
  expect(prepared.status).toBe(200);
  expect((await c.api('post','shipment/advance',{previousStatus:'ready_to_pick',status:'picked'})).status).toBe(200);
});

test('Legacy shipping orders can replace an inactive holder without the removed 20km rule', async () => {
  const c=await setup();
  await Order.updateOne({_id:c.order._id},{status:'shipping',shipperId:c.staff[1]._id,deliveryPlan:null,'deliveryAddress.city':'Ha Noi'});
  expect((await c.api('put','assign',{shipperId:String(c.staff[0]._id)})).status).toBe(200);
  const o=await Order.findById(c.order._id);
  expect(routing.internalAllowed(o)).toBe(true);
  expect(o.deliveryPlan.assignmentMode).toBe('manager_choice');
  expect(distance).not.toHaveBeenCalled();
});

test('Carrier photos are mandatory, stage-bound, private and retained after pickup', async () => {
  const c=await setup(); await c.api('post','dispatch',{method:'ghn'});
  const step={status:'picked',previousStatus:'ready_to_pick',evidenceIds:[]};
  expect((await c.api('post','shipment/advance',step)).status).toBe(400);
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const upload=(actor=c.staff[0],stage='picked')=>auth(request(app).post(`/api/deliveries/${c.order._id}/shipment/evidence/${stage}`),token(actor)).attach('images',image,'proof.png');
  expect((await upload(c.user)).status).toBe(403);
  expect((await upload(c.staff[1])).status).toBe(403);
  expect((await upload(c.staff[0],'delivered')).status).toBe(409);
  const r=await upload(); expect(r.status).toBe(201);
  const id=r.body.data[0]._id;
  expect((await c.api('post','shipment/advance',{...step,evidenceIds:[id,id]})).status).toBe(400);
  expect((await c.api('post','shipment/advance',{...step,evidenceIds:[id]})).status).toBe(200);
  const Evidence=require('../models/DeliveryEvidence');
  expect((await Evidence.findById(id)).expiresAt).toBeUndefined();
  const order=await Order.findById(c.order._id);
  expect(String(order.carrierPickupProof.evidenceIds[0])).toBe(id);
  const url=`/api/orders/${c.order._id}/evidence/${id}`;
  expect((await auth(request(app).get(url),token(c.user))).status).toBe(200);
  expect((await auth(request(app).get(url),token(c.other))).status).toBe(403);
  await c.api('post','shipment/advance',{previousStatus:'picked',status:'transporting'});
  await c.api('post','shipment/advance',{previousStatus:'transporting',status:'delivering'});
  expect((await c.api('post','shipment/advance',{previousStatus:'delivering',status:'delivered',evidenceIds:[]})).status).toBe(400);
  expect((await c.api('post','shipment/advance',{previousStatus:'delivering',status:'delivered',evidenceIds:[id]})).status).toBe(400);
  const delivered=await upload(c.staff[0],'delivered');
  const deliveryId=delivered.body.data[0]._id;
  expect((await c.api('post','shipment/advance',{previousStatus:'delivering',status:'delivered',evidenceIds:[deliveryId]})).status).toBe(200);
  expect((await Evidence.findById(deliveryId)).expiresAt).toBeUndefined();
  const tracking=await request(app).get(`/api/deliveries/track/${order.shipment.code}`);
  expect(tracking.body.data.photos).toHaveLength(2);
  const photo = tracking.body.data.photos.find(p=>p.stage==='delivered');
  expect((await request(app).get('/api'+photo.url)).status).toBe(200);
  expect((await request(app).get(`/api/deliveries/track/GHN-DEMO-${'A'.repeat(32)}/photos/${deliveryId}`)).status).toBe(404);
  expect((await request(app).get(`/api/deliveries/track/${order.shipment.code}/photos/${c.user._id}`)).status).toBe(404);
});
