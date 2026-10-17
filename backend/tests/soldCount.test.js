require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(() => flushEmails());

// "Đã bán" (soldCount) chỉ tính khi khách đã nhận hàng
async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy bán', slug: 'may-ban', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000000 }] });
  const store = await Store.create({ name: 'CN 1' });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 10 });
  const customer = (await registerUser()).body.accessToken;
  await Admin.create({ name: 'Admin', email: 'admin-sold@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'admin-sold@example.com', password: 'admin123' })).body.accessToken;
  return { product, store, customer, admin };
}
async function placeOrder({ product, store, customer }, quantity) {
  await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity });
  const res = await auth(request(app).post('/api/orders'), customer).send({
    storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
  });
  expect(res.statusCode).toBe(201);
  return res.body.data;
}
const setStatus = (admin, id, status) => auth(request(app).put(`/api/orders/${id}/status`), admin).send({ status });
const sold = async (product) => (await Product.findById(product._id)).soldCount || 0;

describe('Số lượng đã bán (soldCount)', () => {
  test('TC-122: Đặt hàng chưa tính; giao thành công mới cộng; trả hàng sau khi giao thì trừ lại', async () => {
    const ctx = await setup();
    const order = await placeOrder(ctx, 2);
    expect(await sold(ctx.product)).toBe(0);

    for (const s of ['confirmed', 'processing', 'shipping']) expect((await setStatus(ctx.admin, order._id, s)).statusCode).toBe(200);
    expect(await sold(ctx.product)).toBe(0);
    expect((await setStatus(ctx.admin, order._id, 'delivered')).statusCode).toBe(200);
    expect(await sold(ctx.product)).toBe(2);

    expect((await setStatus(ctx.admin, order._id, 'returned')).statusCode).toBe(200);
    expect(await sold(ctx.product)).toBe(0);
  });

  test('TC-123: Đơn bị hủy, hoặc bị trả khi đang giao, không làm thay đổi số đã bán', async () => {
    const ctx = await setup();
    const cancelled = await placeOrder(ctx, 1);
    expect((await setStatus(ctx.admin, cancelled._id, 'cancelled')).statusCode).toBe(200);

    const refused = await placeOrder(ctx, 3);
    for (const s of ['confirmed', 'processing', 'shipping', 'returned']) expect((await setStatus(ctx.admin, refused._id, s)).statusCode).toBe(200);
    expect(await sold(ctx.product)).toBe(0);
  });
});
