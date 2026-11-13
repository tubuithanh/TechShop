// Báo cáo nhân viên: số liệu bán hàng / giao hàng / bảo hành, phạm vi quản lý, báo cáo của tôi, xếp hạng
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Warranty = require('../models/Warranty');

const token = (a) => jwt.sign({ id: String(a._id), role: a.role }, process.env.JWT_ACCESS_SECRET);
const get = (url, who) => request(app).get(url).set('Authorization', `Bearer ${token(who)}`);
const H = 3600000;

async function setup() {
  const [s1, s2] = await Store.create([{ name: 'CN Một', address: 'a', city: 'HCM', phoneNumber: '0281234567' }, { name: 'CN Hai', address: 'b', city: 'HN', phoneNumber: '0241234567' }]);
  const mk = (name, title, storeId, extra = {}) => Admin.create({ name, email: `${name.replace(/\s/g, '')}-${Math.random()}@t.vn`, password: '12345678', role: 'staff', title, storeId, ...extra });
  const admin = await Admin.create({ name: 'Root', email: `root-${Math.random()}@t.vn`, password: '12345678', role: 'admin' });
  const manager = await mk('Quan Ly', 'Quản lý chi nhánh', s1._id, { managedStoreIds: [s1._id] });
  const seller = await mk('Ban Hang', 'Nhân viên bán hàng', s1._id);
  const seller2 = await mk('Ban Hang Hai', 'Nhân viên bán hàng', s1._id);
  const shipper = await mk('Giao Hang', 'Nhân viên giao hàng', s1._id);
  const tech = await mk('Ky Thuat', 'Kỹ thuật viên bảo hành', s1._id);
  const other = await mk('Ban Hang CN2', 'Nhân viên bán hàng', s2._id);
  const now = Date.now();
  const order = (extra) => Order.create({ orderCode: `R-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: s1._id, paymentMode: 'cod', items: [{ productId: new mongoose.Types.ObjectId(), name: 'Máy A', quantity: 2, unitPrice: 500 }], itemsTotal: 1000, grandTotal: 1000, ...extra });
  await order({ source: 'pos', createdBy: seller._id, status: 'delivered' });
  await order({ source: 'pos', createdBy: seller._id, status: 'delivered' });
  await order({ source: 'pos', createdBy: seller._id, status: 'cancelled' }); // không tính
  await order({ source: 'pos', createdBy: seller2._id, status: 'delivered' });
  const delivered = await order({ deliveryMethod: 'home_delivery', shipperId: shipper._id, status: 'delivered', deliveryAttempts: [{ result: 'failed', at: new Date() }],
    statusHistory: [{ status: 'shipping', changedAt: new Date(now - 5 * H) }, { status: 'delivered', changedAt: new Date(now - 2 * H) }] });
  await order({ deliveryMethod: 'home_delivery', shipperId: shipper._id, status: 'shipping' });
  await Review.create({ userId: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), orderId: delivered._id, rating: 4, criteria: { delivery: 5 }, tags: ['Giao hàng nhanh'], message: 'Nhanh' });
  await Warranty.create({ ticketCode: `W-${Math.random()}`, orderId: delivered._id, userId: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), storeId: s1._id, issueDescription: 'Lỗi', status: 'done', assignedTo: tech._id, cost: 300, customerRating: 5, statusHistory: [{ status: 'done', changedBy: tech._id, changedAt: new Date() }] }).catch((e) => { throw new Error('Warranty: ' + e.message); });
  return { s1, s2, admin, manager, seller, seller2, shipper, tech, other };
}

test('SRP-1: Báo cáo đội cho quản lý (chỉ chi nhánh mình) + số liệu từng vai trò', async () => {
  const c = await setup();
  const res = await get('/api/staff-reports/team', c.manager);
  expect(res.statusCode).toBe(200);
  const rows = Object.fromEntries(res.body.data.staff.map((r) => [r.name, r]));
  expect(rows['Ban Hang CN2']).toBeUndefined(); // chi nhánh khác
  expect(rows['Ban Hang']).toMatchObject({ kind: 'sales', sales: { orders: 2, revenue: 2000, units: 4, avgOrder: 1000 } });
  expect(rows['Giao Hang']).toMatchObject({ kind: 'delivery', delivery: { assigned: 2, delivered: 1, failedTries: 1, pending: 1, successRate: 50, avgHours: 3, cod: 1000, score: 5, praise: 1 } });
  expect(rows['Ky Thuat']).toMatchObject({ kind: 'warranty', warranty: { tickets: 1, done: 1, revenue: 300, rating: 5, doneRate: 100 } });
  expect(res.body.data.totals.sales.revenue).toBe(3000);

  expect((await get(`/api/staff-reports/team?storeId=${c.s2._id}`, c.manager)).statusCode).toBe(403);
  expect((await get('/api/staff-reports/team', c.seller)).statusCode).toBe(403); // nhân viên thường
  const all = await get('/api/staff-reports/team', c.admin);
  expect(all.body.data.staff.some((r) => r.name === 'Ban Hang CN2')).toBe(true);
});

test('SRP-2: Báo cáo của tôi + xếp hạng; quản lý xem được nhân viên chi nhánh mình, không xem được chi nhánh khác', async () => {
  const c = await setup();
  const me = (await get('/api/staff-reports/me', c.seller)).body.data;
  expect(me.staff.kind).toBe('sales');
  expect(me.metrics.sales.revenue).toBe(2000);
  expect(me.rank.store).toEqual({ rank: 1, of: 2 });
  expect(me.topProducts[0]).toMatchObject({ name: 'Máy A', units: 2 }); // mỗi đơn mẫu là 1 sản phẩm khác nhau
  expect(me.series.length).toBeGreaterThan(0);

  const ship = (await get(`/api/staff-reports/staff/${c.shipper._id}`, c.manager)).body.data;
  expect(ship.feedback.delivery[0]).toMatchObject({ rating: 4, message: 'Nhanh' });
  expect((await get(`/api/staff-reports/staff/${c.other._id}`, c.manager)).statusCode).toBe(403);
  expect((await get(`/api/staff-reports/staff/${c.seller2._id}`, c.seller)).statusCode).toBe(403);
});

test('SRP-3: Tuyến báo cáo - quản lý xem báo cáo người báo cáo trực tiếp (kể cả khác chi nhánh); chặn vòng báo cáo', async () => {
  const c = await setup();
  // Trưởng nhóm không quản lý chi nhánh nào, có 1 người báo cáo trực tiếp ở CN Hai và 1 cấp dưới gián tiếp
  const lead = await Admin.create({ name: 'Truong Nhom', email: `lead-${Math.random()}@t.vn`, password: '12345678', role: 'staff', title: 'Trưởng nhóm bán hàng', storeId: c.s1._id });
  const upd = (who, body) => request(app).put(`/api/staff/${who._id}`).set('Authorization', `Bearer ${token(c.admin)}`).send(body);
  expect((await upd(c.other, { managerId: String(lead._id) })).statusCode).toBe(200);
  expect((await upd(c.seller2, { managerId: String(c.other._id) })).statusCode).toBe(200);
  expect((await upd(lead, { managerId: String(c.seller2._id) })).statusCode).toBe(400); // vòng: lead -> other -> seller2 -> lead
  expect((await upd(lead, { managerId: String(lead._id) })).statusCode).toBe(400);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token(lead)}`);
  expect(me.body.user.directReports).toBe(1);

  const direct = (await get('/api/staff-reports/team?scope=direct', lead)).body.data;
  expect(direct.staff.map((r) => r.name)).toEqual(['Ban Hang CN2']);
  expect(direct.staff[0].isDirect).toBe(true);
  const all = (await get('/api/staff-reports/team', lead)).body.data;
  expect(all.staff.map((r) => r.name).sort()).toEqual(['Ban Hang CN2', 'Ban Hang Hai']); // cả cấp dưới gián tiếp

  expect((await get(`/api/staff-reports/staff/${c.other._id}`, lead)).statusCode).toBe(200);
  expect((await get(`/api/staff-reports/staff/${c.seller._id}`, lead)).statusCode).toBe(403); // không báo cáo cho lead
  expect((await get('/api/staff-reports/team', c.seller)).statusCode).toBe(403); // không có ai báo cáo cho mình

  // Xóa người ở giữa -> cấp dưới chuyển lên báo cáo cho lead
  await request(app).delete(`/api/staff/${c.other._id}`).set('Authorization', `Bearer ${token(c.admin)}`);
  expect(String((await Admin.findById(c.seller2._id)).managerId)).toBe(String(lead._id));
});
