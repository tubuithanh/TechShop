// Trang quản lý bảo hành: số đếm theo trạng thái, phiếu quá hạn / của tôi / chưa phân công, danh sách kỹ thuật viên
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Warranty = require('../models/Warranty');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);

test('WA-1: counts / overdue / mine / unassigned + phân công nhanh + danh sách kỹ thuật viên', async () => {
  const store = await Store.create({ name: 'CN WA' });
  const g = await Group.create({ name: 'BH WA', permissions: ['warranties.manage'] });
  const tech = await Admin.create({ name: 'KTV', email: 'ktv-wa@t.vn', password: 'abc12345', role: 'staff', title: 'Kỹ thuật viên bảo hành', groupIds: [g._id], storeId: store._id });
  const token = (await request(app).post('/api/auth/login').send({ email: 'ktv-wa@t.vn', password: 'abc12345' })).body.accessToken;
  const order = await Order.create({ orderCode: 'DHWA', storeId: store._id, status: 'delivered', paymentMode: 'cod', deliveryMethod: 'store_pickup', items: [{ productId: store._id, quantity: 1, unitPrice: 1, name: 'SP' }], itemsTotal: 1, grandTotal: 1, deliveryAddress: { fullName: 'K', phone: '0900000000' } });
  const base = { orderId: order._id, productId: store._id, issueDescription: 'Lỗi' };
  const old = await Warranty.create({ ...base, ticketCode: 'BHWA1', status: 'checking' });
  await Warranty.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 10 * 86400000) } }); // mở 10 ngày -> quá hạn
  await Warranty.create({ ...base, ticketCode: 'BHWA2', status: 'received', assignedTo: tech._id });
  await Warranty.create({ ...base, ticketCode: 'BHWA3', status: 'returned' });

  const list = (await auth(request(app).get('/api/warranties/admin/all?status=open'), token)).body;
  expect(list.data.map((w) => w.ticketCode)).toEqual(['BHWA1', 'BHWA2']); // đang xử lý, tồn lâu nhất trước
  expect(list.counts).toMatchObject({ open: 2, checking: 1, received: 1, returned: 1 });
  expect(list).toMatchObject({ overdue: 1, mine: 1, unassigned: 1 });
  expect((await auth(request(app).get('/api/warranties/admin/all?status=overdue'), token)).body.data.map((w) => w.ticketCode)).toEqual(['BHWA1']);
  expect((await auth(request(app).get('/api/warranties/admin/all?assigned=me'), token)).body.data[0].assignedTo.name).toBe('KTV');

  const techs = (await auth(request(app).get('/api/warranties/admin/technicians'), token)).body.data;
  expect(techs.map((t) => t.name)).toContain('KTV');
  expect((await auth(request(app).put(`/api/warranties/${old._id}`), token).send({ assignedTo: String(tech._id) })).status).toBe(200);
  expect((await auth(request(app).get('/api/warranties/admin/all?assigned=none&status=open'), token)).body.data).toHaveLength(0);
});
