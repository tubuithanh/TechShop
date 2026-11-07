require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const { flushEmails } = require('../utils/notifyEmail');
const { tierFor } = require('../utils/loyalty');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(() => flushEmails());

// Máy giá 3.000.000đ; chi nhánh 1 còn 10 máy, chi nhánh 2 chỉ còn 1
async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy điểm', slug: 'may-diem', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 3000000 }] });
  const variantId = product.variants[0]._id;
  const [store1, store2] = await Store.create([{ name: 'A Chi nhánh 1' }, { name: 'B Chi nhánh 2' }]);
  await StoreInventory.create([
    { storeId: store1._id, productId: product._id, variantId, stock: 10 },
    { storeId: store2._id, productId: product._id, variantId, stock: 1 }
  ]);
  const reg = await registerUser();
  await Admin.create({ name: 'Admin', email: 'admin11@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'admin11@example.com', password: 'admin123' })).body.accessToken;
  return { product, variantId, store1, store2, customer: reg.body.accessToken, userId: reg.body.user._id, admin };
}
async function placeOrder(ctx, quantity) {
  await auth(request(app).post('/api/cart/items'), ctx.customer).send({ productId: ctx.product._id, variantId: ctx.variantId, quantity });
  const res = await auth(request(app).post('/api/orders'), ctx.customer).send({
    storeId: ctx.store1._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
  });
  expect(res.statusCode).toBe(201);
  return res.body.data;
}
const setStatus = (ctx, id, status) => auth(request(app).put(`/api/orders/${id}/status`), ctx.admin).send({ status, note: 'Kiểm thử' });
// Nhận tại cửa hàng: sẵn sàng -> bàn giao cho khách (= đã giao)
const deliver = async (ctx, id) => {
  for (const s of ['confirmed', 'processing', 'ready_for_pickup']) expect((await setStatus(ctx, id, s)).statusCode).toBe(200);
  expect((await auth(request(app).post(`/api/orders/${id}/handover`), ctx.admin).send({ recipientName: 'Test', paymentConfirmed: true })).statusCode).toBe(200);
};
// Trả hàng: đang hoàn trả (có lý do) -> chi nhánh xác nhận đã nhận lại hàng
const returnOrder = async (ctx, id) => {
  expect((await setStatus(ctx, id, 'returning')).statusCode).toBe(200);
  expect((await auth(request(app).post(`/api/orders/${id}/receive-return`), ctx.admin).send({ received: true })).statusCode).toBe(200);
};
const points = async (ctx) => (await User.findById(ctx.userId)).loyaltyPoints;

describe('Tuần 11: tích điểm hạng thành viên, sổ địa chỉ, thanh toán', () => {
  test('TC-159: Hạng theo điểm: Đồng < 500 ≤ Bạc < 2000 ≤ Vàng < 5000 ≤ Kim cương', () => {
    expect(tierFor(0)).toMatchObject({ key: 'dong', next: { key: 'bac', pointsNeeded: 500 } });
    expect(tierFor(499).key).toBe('dong');
    expect(tierFor(500).key).toBe('bac');
    expect(tierFor(1999)).toMatchObject({ key: 'bac', next: { key: 'vang', pointsNeeded: 1 } });
    expect(tierFor(2000).key).toBe('vang');
    expect(tierFor(5000)).toMatchObject({ key: 'kim_cuong', next: null });
    expect(tierFor(-10).key).toBe('dong');
  });

  test('TC-160: Điểm chỉ cộng khi giao thành công (1 điểm / 10.000đ tiền hàng), trừ lại đúng số đó khi trả hàng', async () => {
    const ctx = await setup();
    const order = await placeOrder(ctx, 2); // 6.000.000đ -> 600 điểm
    expect(await points(ctx)).toBe(0);
    await deliver(ctx, order._id);
    expect(await points(ctx)).toBe(600);

    const res = await auth(request(app).get('/api/users/loyalty'), ctx.customer);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ key: 'bac', points: 600, next: { key: 'vang', pointsNeeded: 1400 } });
    expect(res.body.data.history).toEqual([expect.objectContaining({ orderCode: order.orderCode, points: 600 })]);

    // Đơn hủy / trả khi đang giao không cộng điểm
    const cancelled = await placeOrder(ctx, 1);
    expect((await setStatus(ctx, cancelled._id, 'cancelled')).statusCode).toBe(200);
    expect(await points(ctx)).toBe(600);

    // Trả hàng sau khi giao: trừ lại, lịch sử ghi điểm âm
    await returnOrder(ctx, order._id);
    expect(await points(ctx)).toBe(0);
    const after = (await auth(request(app).get('/api/users/loyalty'), ctx.customer)).body.data;
    expect(after.key).toBe('dong');
    expect(after.history[0].points).toBe(-600);

    // Trang quản trị khách hàng thấy hạng
    const list = (await auth(request(app).get('/api/users/admin/all'), ctx.admin)).body.data;
    expect(list[0].tier).toMatchObject({ key: 'dong', name: 'Đồng' });
  });

  test('TC-161: API của khách (hạng, yêu thích, hồ sơ, địa chỉ, giỏ) từ chối tài khoản quản trị thay vì lỗi 500', async () => {
    const ctx = await setup();
    for (const [method, url] of [['get', '/api/users/loyalty'], ['get', '/api/users/wishlist'], ['put', '/api/users/profile'], ['post', '/api/users/addresses'], ['get', '/api/cart/stores']]) {
      expect((await auth(request(app)[method](url), ctx.admin).send({})).statusCode).toBe(403);
    }
    // Yêu thích: sản phẩm không tồn tại bị từ chối
    expect((await auth(request(app).post('/api/users/wishlist/000000000000000000000000'), ctx.customer)).statusCode).toBe(404);
    expect((await auth(request(app).post(`/api/users/wishlist/${ctx.product._id}`), ctx.customer)).body.added).toBe(true);
  });

  test('TC-162: Sổ địa chỉ: bắt buộc số nhà + tỉnh, chuẩn hóa, bỏ trường lạ, tối đa 5 địa chỉ, luôn có 1 mặc định', async () => {
    const ctx = await setup();
    const add = (body) => auth(request(app).post('/api/users/addresses'), ctx.customer).send(body);
    const before = (await User.findById(ctx.userId)).addresses.length;
    expect((await add({ addressLine1: '  ', city: 'Hà Nội' })).statusCode).toBe(400);
    expect((await add({ addressLine1: '1 Lê Lợi' })).statusCode).toBe(400);

    const ok = await add({ addressLine1: '  12   Lê Lợi ', addressLine2: 'Phường Bến Nghé', city: 'TP. Hồ Chí Minh', hacked: true, _id: '000000000000000000000000' });
    expect(ok.statusCode).toBe(201);
    const created = ok.body.data.at(-1);
    expect(created.addressLine1).toBe('12 Lê Lợi');
    expect(created.hacked).toBeUndefined();
    expect(created._id).not.toBe('000000000000000000000000');
    expect(ok.body.data.filter((a) => a.isDefault)).toHaveLength(1);

    for (let i = before + 1; i < 5; i++) expect((await add({ addressLine1: `Số ${i}`, city: 'Huế' })).statusCode).toBe(201);
    expect((await add({ addressLine1: 'Số 6', city: 'Huế' })).statusCode).toBe(400);

    // Sửa không được làm rỗng tỉnh / thành
    const edit = await auth(request(app).put(`/api/users/addresses/${created._id}`), ctx.customer).send({ city: '' });
    expect(edit.statusCode).toBe(400);
  });

  test('TC-163: Thanh toán: biết trước chi nhánh nào đủ hàng cho cả giỏ (1 đơn lấy hàng từ 1 chi nhánh)', async () => {
    const ctx = await setup();
    await auth(request(app).post('/api/cart/items'), ctx.customer).send({ productId: ctx.product._id, variantId: ctx.variantId, quantity: 2 });
    const stores = (await auth(request(app).get('/api/cart/stores'), ctx.customer)).body.data;
    expect(stores.map((s) => [s.name, s.enough])).toEqual([['A Chi nhánh 1', true], ['B Chi nhánh 2', false]]);
    expect(stores[1].missing).toEqual(['Máy điểm - Đen']);

    // Đặt ở chi nhánh thiếu hàng vẫn bị backend chặn
    const res = await auth(request(app).post('/api/orders'), ctx.customer).send({
      storeId: ctx.store2._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
    });
    expect(res.statusCode).toBe(400);
  });

  test('TC-164: Cộng bù điểm cho đơn đã giao trước khi có tính năng: đúng 1 lần, không cộng đơn chưa giao', async () => {
    const ctx = await setup();
    const Order = require('../models/Order');
    const { migrateLoyalty } = require('../utils/migrateLoyalty');
    const legacy = (status, itemsTotal) => ({ orderCode: `OLD${status}${itemsTotal}`, userId: ctx.userId, storeId: ctx.store1._id, paymentMode: 'cod', status, items: [], itemsTotal, discountAmount: 0, grandTotal: itemsTotal });
    // Ghi thẳng vào collection (bỏ qua giá trị mặc định của schema) để giống dữ liệu cũ chưa có trường loyaltyPoints
    await Order.collection.insertMany([legacy('delivered', 25000000), legacy('delivered', 1234567), legacy('pending', 9000000)]);

    expect(await migrateLoyalty()).toEqual({ orders: 2, points: 2500 + 123 });
    expect(await points(ctx)).toBe(2623);
    expect(await migrateLoyalty()).toEqual({ orders: 0, points: 0 }); // chạy lại không cộng trùng
    expect(await points(ctx)).toBe(2623);
    expect((await Order.findOne({ status: 'pending' })).loyaltyPoints).toBe(0);
  });
});
