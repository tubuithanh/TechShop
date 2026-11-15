// Đơn chuyển khoản chưa được kế toán xác nhận tiền: VẪN phân công shipper được, nhưng shipper CHƯA lấy hàng được
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;

test('AP-1: phân công được; lấy hàng bị chặn với lý do rõ; kế toán xác nhận tiền xong thì lấy hàng được', async () => {
  const store = await Store.create({ name: 'CN AP', city: 'Hồ Chí Minh' });
  const shipG = await Group.create({ name: 'Ship AP', permissions: ['deliveries.perform'] });
  const mgrG = await Group.create({ name: 'QL AP', permissions: ['deliveries.manage', 'orders.manage'] });
  const accG = await Group.create({ name: 'KT AP', permissions: ['orders.view', 'finance.payments'] });
  const shipper = await Admin.create({ name: 'Shipper AP', email: 'ship-ap@t.vn', password: 'abc12345', role: 'staff', groupIds: [shipG._id], storeId: store._id });
  await Admin.create({ name: 'QL', email: 'ql-ap@t.vn', password: 'abc12345', role: 'staff', groupIds: [mgrG._id], storeId: store._id });
  await Admin.create({ name: 'KT', email: 'kt-ap@t.vn', password: 'abc12345', role: 'staff', title: 'Kế toán chi nhánh', groupIds: [accG._id], storeId: store._id });
  const order = await Order.create({
    orderCode: 'DHAP1', storeId: store._id, status: 'processing', paymentMode: 'bank_transfer', paymentStatus: 'pending', deliveryMethod: 'home_delivery',
    items: [{ productId: store._id, quantity: 1, unitPrice: 1000000, name: 'SP' }], itemsTotal: 1000000, grandTotal: 1000000,
    deliveryAddress: { fullName: 'Khách', phone: '0900000000', addressLine1: '1 Lê Lợi', city: 'Hồ Chí Minh' }
  });

  const mgr = await login('ql-ap@t.vn');
  const assign = await auth(request(app).put(`/api/deliveries/${order._id}/assign`), mgr).send({ shipperId: String(shipper._id) });
  expect(assign.status).toBe(200); // vẫn phân công được

  const ship = await login('ship-ap@t.vn');
  const blocked = await auth(request(app).post(`/api/deliveries/${order._id}/pickup`), ship);
  expect(blocked.status).toBe(400);
  expect(blocked.body.message).toMatch(/kế toán xác nhận/);

  const paid = await auth(request(app).post(`/api/orders/${order._id}/confirm-payment`), await login('kt-ap@t.vn')).send({ confirmed: true });
  expect(paid.status).toBe(200);
  const ok = await auth(request(app).post(`/api/deliveries/${order._id}/pickup`), ship);
  expect(ok.status).toBe(200);
  expect(ok.body.data.status).toBe('shipping');
});
