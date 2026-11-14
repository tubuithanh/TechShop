// Rà soát giai đoạn 4 (sau bán hàng): các lỗi phát hiện khi chú thích từng dòng code
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Group = require('../models/PermissionGroup');
const Store = require('../models/Store');
const Order = require('../models/Order');
const User = require('../models/User');
const Warranty = require('../models/Warranty');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;

async function setup() {
  const storeA = await Store.create({ name: 'Chi nhánh A' });
  const storeB = await Store.create({ name: 'Chi nhánh B' });
  const customer = await User.create({ displayName: 'Khách', email: 'khach-p4@example.com', password: '123456' });
  const base = { userId: customer._id, items: [{ productId: customer._id, quantity: 1, unitPrice: 100000, name: 'SP' }], deliveryAddress: { fullName: 'Khách', phone: '0900000000' }, paymentMode: 'cod', itemsTotal: 100000, grandTotal: 100000, status: 'delivered' };
  const orderA = await Order.create({ ...base, orderCode: 'DHP4A', storeId: storeA._id });
  const orderB = await Order.create({ ...base, orderCode: 'DHP4B', storeId: storeB._id });
  const wA = await Warranty.create({ ticketCode: 'BHP4A', orderId: orderA._id, productId: customer._id, issueDescription: 'Lỗi A' });
  const wB = await Warranty.create({ ticketCode: 'BHP4B', orderId: orderB._id, productId: customer._id, issueDescription: 'Lỗi B' });
  const warrantyGroup = await Group.create({ name: 'BH', permissions: ['warranties.manage'] });
  await Admin.create({ name: 'BH chi nhánh A', email: 'bh-a@t.vn', password: 'abc12345', role: 'staff', groupIds: [warrantyGroup._id], storeId: storeA._id });
  return { orderA, orderB, wA, wB, warrantyGroup, storeA };
}

describe('Giai đoạn 4 - sau bán hàng', () => {
  test('P4-1: nhân viên bảo hành chỉ thấy / sửa phiếu của chi nhánh mình', async () => {
    const { wA, wB } = await setup();
    const token = await login('bh-a@t.vn');
    const list = await auth(request(app).get('/api/warranties/admin/all'), token);
    expect(list.status).toBe(200);
    expect(list.body.data.map((w) => w.ticketCode)).toEqual(['BHP4A']);
    expect((await auth(request(app).put(`/api/warranties/${wB._id}/status`), token).send({ status: 'checking' })).status).toBe(403);
    expect((await auth(request(app).put(`/api/warranties/${wB._id}`), token).send({ issueDescription: 'Sửa' })).status).toBe(403);
    expect((await auth(request(app).put(`/api/warranties/${wA._id}/status`), token).send({ status: 'checking' })).status).toBe(200);
  });

  test('P4-2: ghi chú / mô tả / ảnh phiếu bảo hành sai kiểu hoặc quá dài bị từ chối', async () => {
    const { wA } = await setup();
    const token = await login('bh-a@t.vn');
    expect((await auth(request(app).put(`/api/warranties/${wA._id}/status`), token).send({ status: 'checking', note: 'x'.repeat(1001) })).status).toBe(400);
    expect((await auth(request(app).put(`/api/warranties/${wA._id}`), token).send({ images: 'abc' })).status).toBe(400);
    expect((await auth(request(app).put(`/api/warranties/${wA._id}`), token).send({ issueDescription: { a: 1 } })).status).toBe(400);
  });

  test('P4-3: nhân viên không có quyền quản lý đơn không xem được hóa đơn điện tử theo đơn', async () => {
    const { orderA } = await setup();
    const token = await login('bh-a@t.vn'); // chỉ có quyền bảo hành
    expect((await auth(request(app).get(`/api/einvoices/by-order/${orderA._id}`), token)).status).toBe(403);
  });

  test('P4-4: bản nháp hóa đơn dùng đúng mẫu số theo cấu hình', async () => {
    const { draftForOrder, sellerInfo } = require('../utils/einvoice');
    const { orderA } = await setup();
    const draft = await draftForOrder(orderA);
    expect(draft.template).toBe((await sellerInfo()).template);
  });
});
