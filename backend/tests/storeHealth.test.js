// Báo cáo sức khỏe: điểm 0-100 theo 6 nhóm, phát hiện vấn đề; nhiều chi nhánh -> TechShop + xếp hạng; quản lý chỉ thấy chi nhánh mình
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Inventory = require('../models/StoreInventory');

const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);
const get = (who, q = '') => request(app).get(`/api/store-health${q}`).set('Authorization', `Bearer ${token(who)}`);
const DAY = 86400000;

test('SH-1: Chi nhánh tốt điểm cao hơn chi nhánh có vấn đề; TechShop gộp; quản lý chỉ thấy chi nhánh mình', async () => {
  const [good, bad] = await Store.create([{ name: 'CN Tốt', address: 'a', city: 'HCM', phoneNumber: '0281234567' }, { name: 'CN Yếu', address: 'b', city: 'HN', phoneNumber: '0241234567' }]);
  const admin = await Admin.create({ name: 'Root', email: `r-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const mgr = await Admin.create({ name: 'QL Yếu', email: `q-${Math.random()}@t.vn`, password: '12345678', role: 'staff', title: 'Quản lý chi nhánh', storeId: bad._id, managedStoreIds: [bad._id] });
  for (const [store, titles] of [[good, ['Quản lý chi nhánh', 'Nhân viên bán hàng', 'Nhân viên giao hàng', 'Kỹ thuật viên bảo hành']], [bad, ['Nhân viên bán hàng']]]) {
    for (const t of titles) await Admin.create({ name: t, email: `${Math.random()}@t.vn`, password: '12345678', role: 'staff', title: t, storeId: store._id });
  }
  const pid = new mongoose.Types.ObjectId(); const vid = new mongoose.Types.ObjectId();
  await Inventory.create([{ storeId: good._id, productId: pid, variantId: vid, stock: 20 }, { storeId: bad._id, productId: pid, variantId: vid, stock: 0 }]);
  const mk = (store, extra, at = Date.now() - 3 * DAY) => Order.create({ orderCode: `H-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', status: 'delivered',
    items: [{ productId: pid, variantId: vid, name: 'Máy hot', quantity: 1, unitPrice: 10000000 }], itemsTotal: 10000000, grandTotal: 10000000, createdAt: new Date(at), ...extra });
  // Kỳ trước: cả 2 bán như nhau; kỳ này: CN Tốt tăng, CN Yếu giảm + hủy nhiều + COD giữ lâu
  for (let i = 0; i < 4; i++) { await mk(good, {}, Date.now() - 40 * DAY); await mk(bad, {}, Date.now() - 40 * DAY); }
  for (let i = 0; i < 6; i++) { const o = await mk(good, {}); await Review.create({ userId: new mongoose.Types.ObjectId(), productId: pid, orderId: o._id, rating: 5, criteria: { delivery: 5 } }); }
  const b1 = await mk(bad, {});
  await Review.create({ userId: new mongoose.Types.ObjectId(), productId: pid, orderId: b1._id, rating: 2, criteria: { delivery: 1 }, tags: ['Giao hàng chậm'] });
  for (let i = 0; i < 3; i++) await mk(bad, { status: 'cancelled' });
  await mk(bad, { codCollectedAt: new Date(Date.now() - 5 * DAY), codSettledAt: null });
  for (const o of await Order.find({})) await Order.collection.updateOne({ _id: o._id }, { $set: { createdAt: o.createdAt } });

  const all = (await get(admin)).body.data;
  expect(all.mode).toBe('company');
  expect(all.stores.map((s) => s.store.name)).toEqual(['CN Tốt', 'CN Yếu']); // xếp hạng
  const [g, b] = all.stores;
  expect(g.score).toBeGreaterThan(b.score);
  expect(g.groups).toHaveLength(6);
  expect(b.issues.map((i) => i.group)).toEqual(expect.arrayContaining(['revenue', 'customer', 'operations', 'inventory', 'people', 'risk']));
  expect(b.issues.find((i) => i.group === 'inventory').text).toMatch(/Máy hot/);
  expect(all.overview.kpi.revenue).toBe(g.kpi.revenue + b.kpi.revenue);

  const single = (await get(admin, `?storeId=${good._id}`)).body.data;
  expect(single.mode).toBe('store');
  expect(single.overview.score).toBe(g.score);

  const mine = (await get(mgr)).body.data;
  expect(mine.mode).toBe('store');
  expect(mine.stores[0].store.name).toBe('CN Yếu');
  expect((await get(mgr, `?storeId=${good._id}`)).statusCode).toBe(403);
  const seller = await Admin.findOne({ title: 'Nhân viên bán hàng', storeId: good._id });
  expect((await get(seller)).statusCode).toBe(403);
});
