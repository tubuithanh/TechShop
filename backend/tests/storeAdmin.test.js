require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Order = require('../models/Order');
const StoreInventory = require('../models/StoreInventory');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;

async function setup() {
  await Admin.create({ name: 'Admin', email: 'adminst@example.com', password: 'admin123', role: 'admin' });
  await Admin.create({ name: 'NV', email: 'nvst@example.com', password: 'abc12345', role: 'staff' });
  return { admin: await login('adminst@example.com', 'admin123'), staff: await login('nvst@example.com', 'abc12345') };
}
const valid = { name: 'TechShop Đà Nẵng', address: '12 Lê Duẩn, Hải Châu', city: 'Đà Nẵng', phoneNumber: '0236 3888 999', email: 'DN@techshop.vn', openHours: '8:00 - 22:00', lat: 16.07, lng: 108.22 };

describe('Quản trị chi nhánh', () => {
  test('ST-1: Admin thêm chi nhánh mới: kiểm tra dữ liệu, trùng tên; chi nhánh hiện ngay ở danh sách công khai', async () => {
    const c = await setup();
    const create = (body, t = c.admin) => auth(request(app).post('/api/stores'), t).send(body);
    expect((await create(valid, c.staff)).statusCode).toBe(403);
    for (const bad of [{ name: 'AB' }, { address: '' }, { city: '' }, { phoneNumber: 'abc' }, { email: 'x@' }, { lat: 200 }, { lng: '' }]) {
      expect((await create({ ...valid, ...bad })).statusCode).toBe(400);
    }
    const ok = await create({ ...valid, _id: '507f1f77bcf86cd799439011', isActive: true });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.data).toMatchObject({ name: 'TechShop Đà Nẵng', email: 'dn@techshop.vn', isActive: true });
    expect(ok.body.data._id).not.toBe('507f1f77bcf86cd799439011');
    expect((await create({ ...valid, name: 'techshop đà nẵng' })).statusCode).toBe(409);

    const pub = (await request(app).get('/api/stores')).body.data.map((s) => s.name);
    expect(pub).toContain('TechShop Đà Nẵng');
    expect((await request(app).get('/api/stores/cities')).body.data).toContain('Đà Nẵng');

    const list = (await auth(request(app).get('/api/stores/admin/all'), c.admin)).body.data;
    expect(list[0].stats).toMatchObject({ staff: 0, productsInStock: 0, openOrders: 0 });
    expect((await auth(request(app).get('/api/stores/admin/all'), c.staff)).statusCode).toBe(403);
  });

  test('ST-2: Ngưng hoạt động bị chặn khi còn đơn đang xử lý / nhân viên; ngưng xong thì ẩn khỏi trang khách, mở lại được', async () => {
    const c = await setup();
    const store = (await auth(request(app).post('/api/stores'), c.admin).send(valid)).body.data;
    const order = await Order.create({ orderCode: 'STO1', storeId: store._id, status: 'pending', paymentMode: 'cod', items: [], itemsTotal: 1, grandTotal: 1 });
    await Admin.create({ name: 'NV2', email: 'nv2st@example.com', password: 'abc12345', role: 'staff', storeId: store._id });
    await StoreInventory.create({ storeId: store._id, productId: store._id, variantId: store._id, stock: 5 });

    const stats = (await auth(request(app).get('/api/stores/admin/all'), c.admin)).body.data[0].stats;
    expect(stats).toMatchObject({ staff: 1, productsInStock: 1, unitsInStock: 5, openOrders: 1 });

    const del = await auth(request(app).delete(`/api/stores/${store._id}`), c.admin);
    expect(del.statusCode).toBe(409);
    expect(del.body.message).toMatch(/1 đơn hàng đang xử lý.*1 nhân viên/);
    expect((await auth(request(app).put(`/api/stores/${store._id}`), c.admin).send({ isActive: false })).statusCode).toBe(409);

    await Order.updateOne({ _id: order._id }, { status: 'delivered' });
    await Admin.updateOne({ email: 'nv2st@example.com' }, { storeId: null });
    expect((await auth(request(app).delete(`/api/stores/${store._id}`), c.admin)).statusCode).toBe(200);
    expect((await request(app).get('/api/stores')).body.data.map((s) => s.name)).not.toContain(valid.name);
    expect((await Store.findById(store._id)).isActive).toBe(false); // không xóa hẳn: đơn cũ vẫn tham chiếu

    const reopen = await auth(request(app).put(`/api/stores/${store._id}`), c.admin).send({ isActive: true, openHours: '9:00 - 21:00' });
    expect(reopen.body.data).toMatchObject({ isActive: true, openHours: '9:00 - 21:00', name: valid.name });
  });

  test('ST-3: Chi nhánh cũ thiếu địa chỉ vẫn mở lại / sửa giờ được; nhận số tổng đài 1900; không gán nhân viên vào chi nhánh đã ngưng', async () => {
    const c = await setup();
    const legacy = await Store.create({ name: 'Chi nhánh cũ', isActive: false }); // dữ liệu cũ: không địa chỉ, không tỉnh
    const reopen = await auth(request(app).put(`/api/stores/${legacy._id}`), c.admin).send({ isActive: true, openHours: '9:00 - 21:00' });
    expect(reopen.statusCode).toBe(200);
    expect((await auth(request(app).put(`/api/stores/${legacy._id}`), c.admin).send({ address: '' })).statusCode).toBe(400); // chủ động xóa địa chỉ thì không được
    expect((await auth(request(app).put(`/api/stores/${legacy._id}`), c.admin).send({ phoneNumber: '1900 6868' })).statusCode).toBe(200);

    const closed = await Store.create({ name: 'CN đã ngưng', address: 'x', city: 'Huế', isActive: false });
    const nv = await Admin.findOne({ email: 'nvst@example.com' });
    expect((await auth(request(app).put(`/api/staff/${nv._id}`), c.admin).send({ storeId: closed._id })).statusCode).toBe(400);
    expect((await auth(request(app).put(`/api/staff/${nv._id}`), c.admin).send({ managedStoreIds: [closed._id] })).statusCode).toBe(400);
    expect((await auth(request(app).post(`/api/staff/${nv._id}/transfers`), c.admin).send({ storeId: closed._id, months: 1 })).statusCode).toBe(400);
  });

  test('ST-4: Quản lý chỉ có chi nhánh quản lý thêm, khi các chi nhánh đó ngưng hoạt động -> KHÔNG thành "không giới hạn"', async () => {
    const c = await setup();
    const other = await Store.create({ name: 'CN khác', address: 'y', city: 'Hà Nội' });
    const managed = await Store.create({ name: 'CN quản lý', address: 'z', city: 'Hà Nội' });
    await Order.create([
      { orderCode: 'ST4A', storeId: other._id, status: 'pending', paymentMode: 'cod', items: [], itemsTotal: 1, grandTotal: 1 },
      { orderCode: 'ST4B', storeId: managed._id, status: 'delivered', paymentMode: 'cod', items: [], itemsTotal: 1, grandTotal: 1 }
    ]);
    const PermissionGroup = require('../models/PermissionGroup');
    const group = await PermissionGroup.create({ name: 'Đơn hàng ST4', permissions: ['orders.manage'] });
    await Admin.create({ name: 'QL vùng', email: 'qlvung@example.com', password: 'abc12345', role: 'staff', groupIds: [group._id], managedStoreIds: [managed._id] });
    const token = await login('qlvung@example.com', 'abc12345');
    const codes = async () => (await auth(request(app).get('/api/orders/admin/all'), token)).body.data.map((o) => o.orderCode);
    expect(await codes()).toEqual(['ST4B']);
    await Store.updateOne({ _id: managed._id }, { isActive: false });
    expect(await codes()).toEqual([]); // không thấy đơn của chi nhánh khác
  });
});
