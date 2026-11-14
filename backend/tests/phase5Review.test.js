// Rà soát giai đoạn 5 (quản trị & báo cáo): các lỗi phát hiện khi chú thích từng dòng code
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Setting = require('../models/Setting');
const StoreInventory = require('../models/StoreInventory');
const Category = require('../models/Category');
const Product = require('../models/Product');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;
async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'p5-admin@t.vn', password: 'abc12345', role: 'admin' });
  return login('p5-admin@t.vn');
}

describe('Giai đoạn 5 - quản trị', () => {
  test('P5-1: tạo / sửa nhân viên với dữ liệu sai kiểu hoặc mật khẩu ngắn -> 400 (trước đây 500 / chấp nhận)', async () => {
    const token = await adminToken();
    const post = (body) => auth(request(app).post('/api/staff'), token).send(body);
    expect((await post({ name: 'A', email: { a: 1 }, password: 'abc12345' })).status).toBe(400);
    expect((await post({ name: 'A', email: 'a@t.vn', password: '1' })).status).toBe(400);
    expect((await post({ name: 'A', email: 'a@t.vn', password: 'abc12345', groupIds: 'x' })).status).toBe(400);
    const ok = await post({ name: 'A', email: 'a@t.vn', password: 'abc12345' });
    expect(ok.status).toBe(201);
    expect((await auth(request(app).put(`/api/staff/${ok.body.data._id}`), token).send({ isActive: 'no' })).status).toBe(400);
  });

  test('P5-2: nhóm quyền với permissions không phải mảng -> 400', async () => {
    const token = await adminToken();
    expect((await auth(request(app).post('/api/permission-groups'), token).send({ name: 'Nhóm X', permissions: 'orders.manage' })).status).toBe(400);
  });

  test('P5-3: PUT /api/settings không ghi đè được orderSla / einvoice (có API riêng)', async () => {
    const token = await adminToken();
    await auth(request(app).put('/api/settings'), token).send({ siteName: 'Shop P5', orderSla: 'hỏng', einvoice: 123 });
    const s = await Setting.findOne().lean();
    expect(s.siteName).toBe('Shop P5');
    expect(s.orderSla).toBeUndefined();
    expect(s.einvoice).toBeUndefined();
  });

  test('P5-4: lưu ngưỡng quá hạn 1 nhóm không làm mất ngưỡng các nhóm khác; gửi rỗng thì về mặc định', async () => {
    const token = await adminToken();
    await auth(request(app).put('/api/orders/admin/inbox/sla'), token).send({ confirm: 30, refund: 600 });
    const r = await auth(request(app).put('/api/orders/admin/inbox/sla'), token).send({ confirm: 45 });
    expect(r.body.data.confirm).toBe(45);
    expect(r.body.data.refund).toBe(600);
    const reset = await auth(request(app).put('/api/orders/admin/inbox/sla'), token).send({ refund: '' });
    expect(reset.body.data.refund).toBe(24 * 60);
  });

  test('P5-5: cảnh báo sắp hết hàng chỉ trả dòng tồn kho <= ngưỡng', async () => {
    const token = await adminToken();
    const category = await Category.create({ name: 'ĐT', slug: 'dt-p5' });
    const product = await Product.create({ title: 'Máy', slug: 'may-p5', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }, { color: 'Trắng', price: 1000 }] });
    const store = await Store.create({ name: 'CN P5' });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 2, lowStockThreshold: 5 });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[1]._id, stock: 50, lowStockThreshold: 5 });
    const r = await auth(request(app).get('/api/store-inventories/low-stock'), token);
    expect(r.status).toBe(200);
    expect(r.body.data.map((x) => x.stock)).toEqual([2]);
  });

  test('P5-6: "Cửa hàng trưởng" xem được báo cáo nhân viên chi nhánh mình', async () => {
    const store = await Store.create({ name: 'CN P5B' });
    await Admin.create({ name: 'CHT', email: 'cht@t.vn', password: 'abc12345', role: 'staff', title: 'Cửa hàng trưởng', storeId: store._id });
    await Admin.create({ name: 'NV', email: 'nv-p5@t.vn', password: 'abc12345', role: 'staff', title: 'Nhân viên bán hàng', storeId: store._id });
    const token = await login('cht@t.vn');
    const r = await auth(request(app).get('/api/staff-reports/team'), token);
    expect(r.status).toBe(200);
    expect(r.body.data.staff.map((s) => s.name).sort()).toEqual(['CHT', 'NV']);
  });
});
