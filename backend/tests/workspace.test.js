// Bàn làm việc theo vị trí: mỗi vai trò nhận đúng khối thông tin của mình
require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');

test('WS-1: Bán hàng / giao hàng / kỹ thuật / trưởng cửa hàng thấy đúng việc của mình', async () => {
  const store = await Store.create({ name: 'Q1' });
  const g = await Group.create({ name: 'All', permissions: ['orders.manage', 'deliveries.perform', 'warranties.manage'] });
  const mk = async (title) => {
    const email = `${Math.random()}@t.vn`;
    const a = await Admin.create({ name: title, email, password: 'abc12345', role: 'staff', title, groupIds: [g._id], storeId: store._id });
    a.token = (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;
    return a;
  };
  const [sales, ship, tech, mgr] = [await mk('Nhân viên bán hàng'), await mk('Nhân viên giao hàng'), await mk('Kỹ thuật viên bảo hành'), await mk('Quản lý chi nhánh')];
  const order = (extra) => Order.create({ orderCode: `W-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', deliveryMethod: 'home_delivery',
    deliveryAddress: { fullName: 'K', phone: '0912345678', addressLine1: '1 A', city: 'HCM' }, items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, unitPrice: 100 }], itemsTotal: 100, grandTotal: 100, ...extra });
  await order({ status: 'pending' });
  await order({ status: 'confirmed' });
  await order({ status: 'shipping', shipperId: ship._id, express: { deadline: new Date(Date.now() + 3600000) } });
  const o = await order({ status: 'delivered' });
  await Warranty.create({ ticketCode: `T-${Math.random()}`, orderId: o._id, productId: new mongoose.Types.ObjectId(), issueDescription: 'Lỗi', status: 'checking', assignedTo: tech._id, createdAt: new Date(Date.now() - 9 * 86400000) });
  const get = (a) => request(app).get('/api/workspace').set('Authorization', `Bearer ${a.token}`).then((r) => r.body.data);

  const s = await get(sales);
  expect(s.role).toBe('sales');
  expect(s.toConfirm.count).toBe(1);
  expect(s.warehouse.toPrepare.count).toBe(1);
  expect(s.delivery).toBeUndefined();

  const d = await get(ship);
  expect(d.role).toBe('delivery');
  expect(d.delivery.shipping).toHaveLength(1);
  expect(d.delivery.express[0].minutesLeft).toBeGreaterThan(50);
  expect(d.sales).toBeUndefined();

  const t = await get(tech);
  expect(t.role).toBe('warranty');
  expect(t.warranty).toMatchObject({ open: 1, overdue: 1 });

  const m = await get(mgr);
  expect(m.role).toBe('manager');
  expect(m.manager.unassignedDeliveries).toBe(1); // đơn confirmed chưa có shipper
  expect(m.manager.einvoicePending).toBe(1);       // đơn đã giao chưa xuất hóa đơn
});

test('WS-2: Doanh thu theo lúc GIAO (không theo lúc sửa đơn); đơn giao quá 3 ngày; bảo hành chỉ của chi nhánh mình', async () => {
  const [s1, s2] = await Store.create([{ name: 'CN 1' }, { name: 'CN 2' }]);
  const g = await Group.create({ name: 'Mgr', permissions: ['orders.manage'] });
  const email = `ql-${Math.random()}@t.vn`;
  await Admin.create({ name: 'QL', email, password: 'abc12345', role: 'staff', title: 'Quản lý chi nhánh', groupIds: [g._id], storeId: s1._id });
  const token = (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;
  const H = 3600000; const D = 24 * H;
  const mk = (store, extra) => Order.create({ orderCode: `X-${Math.random()}`, userId: new mongoose.Types.ObjectId(), storeId: store._id, paymentMode: 'cod', deliveryMethod: 'home_delivery',
    deliveryAddress: { fullName: 'K', phone: '0912345678', addressLine1: '1 A', city: 'HCM' }, items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, unitPrice: 100 }], itemsTotal: 100, ...extra });
  // Giao xong 2 ngày trước nhưng HÔM NAY mới được sửa (VD xuất hóa đơn) -> KHÔNG tính doanh thu hôm nay
  await mk(s1, { status: 'delivered', grandTotal: 5000, statusHistory: [{ status: 'delivered', eventType: 'status', changedAt: new Date(Date.now() - 2 * D) }] });
  // Giao xong hôm nay -> tính
  await mk(s1, { status: 'delivered', grandTotal: 700, statusHistory: [{ status: 'delivered', eventType: 'status', changedAt: new Date() }] });
  // Bắt đầu giao 4 ngày trước, vừa sửa hôm nay -> vẫn là "giao quá 3 ngày"
  await mk(s1, { status: 'shipping', grandTotal: 1, statusHistory: [{ status: 'shipping', eventType: 'status', changedAt: new Date(Date.now() - 4 * D) }] });
  // Phiếu bảo hành: 1 của chi nhánh mình, 1 của chi nhánh khác
  const own = await mk(s1, { status: 'delivered', grandTotal: 1, statusHistory: [] });
  const other = await mk(s2, { status: 'delivered', grandTotal: 1, statusHistory: [] });
  for (const o of [own, other]) await Warranty.create({ ticketCode: `T-${Math.random()}`, orderId: o._id, productId: new mongoose.Types.ObjectId(), issueDescription: 'x', status: 'checking' });

  const d = (await request(app).get('/api/workspace').set('Authorization', `Bearer ${token}`)).body.data;
  expect(d.manager.revenueToday).toBe(700);
  expect(d.manager.ordersDoneToday).toBe(1);
  expect(d.manager.stuckShipping).toBe(1);
  expect(d.warranty.open).toBe(1); // không thấy phiếu của chi nhánh khác
});
