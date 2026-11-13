// Đóng dấu người thao tác: ai thêm / sửa / ẩn bản ghi trong trang quản trị
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Voucher = require('../models/Voucher');
const Store = require('../models/Store');
const Group = require('../models/PermissionGroup');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const DAY = 864e5;

async function setup() {
  await Admin.create({ name: 'Quản trị A', email: 'auditA@example.com', password: 'admin123', role: 'admin' });
  await Admin.create({ name: 'Quản trị B', email: 'auditB@example.com', password: 'admin123', role: 'admin' });
  const group = await Group.create({ name: 'SP', permissions: ['products.manage'] });
  await Admin.create({ name: 'NV Sản phẩm', email: 'auditNV@example.com', password: 'abc12345', role: 'staff', groupIds: [group._id] });
  return { a: await login('auditA@example.com', 'admin123'), b: await login('auditB@example.com', 'admin123'), nv: await login('auditNV@example.com', 'abc12345') };
}

describe('Đóng dấu người thao tác', () => {
  test('AUD-1: Tạo bởi A, sửa bởi B; ẩn ghi hành động "deactivate"; danh sách trả về dấu người thao tác', async () => {
    const c = await setup();
    const created = await auth(request(app).post('/api/vouchers'), c.a).send({ code: 'AUDIT10', discountType: 'percent', discountValue: 10, endDate: new Date(Date.now() + DAY).toISOString() });
    expect(created.statusCode).toBe(201);
    expect(created.body.data.audit).toMatchObject({ createdByName: 'Quản trị A', updatedByName: 'Quản trị A', action: 'create' });

    await auth(request(app).put(`/api/vouchers/${created.body.data._id}`), c.b).send({ discountValue: 15 });
    let v = await Voucher.findById(created.body.data._id).lean();
    expect(v.audit).toMatchObject({ createdByName: 'Quản trị A', updatedByName: 'Quản trị B', action: 'update' });

    await auth(request(app).delete(`/api/vouchers/${created.body.data._id}`), c.a).send();
    v = await Voucher.findById(created.body.data._id).lean();
    expect(v.audit).toMatchObject({ updatedByName: 'Quản trị A', action: 'deactivate' });

    const list = await auth(request(app).get('/api/vouchers'), c.a);
    expect(list.body.data[0].audit.updatedByName).toBe('Quản trị A');
  });

  test('AUD-2: Nhân viên có quyền sửa sản phẩm được ghi tên; khách hàng / tác vụ phụ không đóng dấu', async () => {
    const c = await setup();
    const cat = await Category.create({ name: 'Điện thoại', slug: 'dt-audit' });
    const res = await auth(request(app).post('/api/products'), c.nv).send({ title: 'Máy audit', categoryId: cat._id, price: 1, variants: [{ color: 'Đen', price: 1000000 }] });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.audit).toMatchObject({ createdByName: 'NV Sản phẩm', action: 'create' });
    expect(res.body.data.variants[0].audit).toBeUndefined(); // không đóng dấu phần con

    // Bản ghi tạo ngoài trang quản trị (script, khách hàng) không có dấu
    const store = await Store.create({ name: 'CN audit' });
    expect(store.audit?.createdBy).toBeUndefined();
    const customer = (await registerUser()).body.accessToken;
    await auth(request(app).post('/api/cart/items'), customer).send({ productId: res.body.data._id, variantId: res.body.data.variants[0]._id, quantity: 1 });
    expect((await Product.findById(res.body.data._id).lean()).audit.updatedByName).toBe('NV Sản phẩm');
  });
});
