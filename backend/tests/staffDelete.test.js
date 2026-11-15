// Không xóa hẳn nhân viên đã có hoạt động (giữ lịch sử đơn / báo cáo) - chỉ khóa; tài khoản tạo nhầm vẫn xóa được
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);

test('SD-1: nhân viên đã bán đơn -> 409 (khóa thay vì xóa); tài khoản chưa hoạt động -> xóa được', async () => {
  await Admin.create({ name: 'Admin', email: 'sd-admin@t.vn', password: 'abc12345', role: 'admin' });
  const token = (await request(app).post('/api/auth/login').send({ email: 'sd-admin@t.vn', password: 'abc12345' })).body.accessToken;
  const store = await Store.create({ name: 'CN SD' });
  const seller = await Admin.create({ name: 'Đã bán', email: 'sd-seller@t.vn', password: 'abc12345', role: 'staff', storeId: store._id });
  const fresh = await Admin.create({ name: 'Tạo nhầm', email: 'sd-fresh@t.vn', password: 'abc12345', role: 'staff' });
  await Order.create({ orderCode: 'DHSD1', source: 'pos', createdBy: seller._id, storeId: store._id, status: 'delivered', paymentMode: 'cash', deliveryMethod: 'store_pickup', items: [{ productId: store._id, quantity: 1, unitPrice: 1, name: 'SP' }], itemsTotal: 1, grandTotal: 1, deliveryAddress: { fullName: 'K', phone: '0900000000' } });

  const blocked = await auth(request(app).delete(`/api/staff/${seller._id}`), token);
  expect(blocked.status).toBe(409);
  expect(blocked.body.code).toBe('HAS_ACTIVITY');
  expect(await Admin.exists({ _id: seller._id })).toBeTruthy();
  expect((await auth(request(app).delete(`/api/staff/${fresh._id}`), token)).status).toBe(200);
  expect(await Admin.exists({ _id: fresh._id })).toBeFalsy();
});
