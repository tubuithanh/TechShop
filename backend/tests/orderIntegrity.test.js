require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Voucher = require('../models/Voucher');
const Order = require('../models/Order');
const { expireUnpaidVnpayOrders } = require('../utils/expireUnpaidOrders');
const { restoreStock } = require('../controllers/orderController');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(() => flushEmails());

async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy đơn', slug: 'may-don', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000000 }] });
  const variantId = product.variants[0]._id;
  const store = await Store.create({ name: 'CN mở' });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId, stock: 20 });
  const customer = (await registerUser()).body.accessToken;
  await Admin.create({ name: 'Admin', email: 'admin-don@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'admin-don@example.com', password: 'admin123' })).body.accessToken;
  return { product, variantId, store, customer, admin };
}
const addToCart = (ctx, token = ctx.customer) =>
  auth(request(app).post('/api/cart/items'), token).send({ productId: ctx.product._id, variantId: ctx.variantId, quantity: 1 });
const PICKUP = { deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' } };
const placeOrder = (ctx, body = {}, token = ctx.customer) => auth(request(app).post('/api/orders'), token).send({ storeId: ctx.store._id, ...PICKUP, ...body });

describe('Đặt hàng', () => {
  test('TC-132: Chỉ khách hàng đặt hàng; cửa hàng phải đang hoạt động; người nhận và địa chỉ phải hợp lệ', async () => {
    const ctx = await setup();
    await addToCart(ctx);
    expect((await placeOrder(ctx, {}, ctx.admin)).statusCode).toBe(403);

    const closed = await Store.create({ name: 'CN đóng', isActive: false });
    await StoreInventory.create({ storeId: closed._id, productId: ctx.product._id, variantId: ctx.variantId, stock: 5 });
    expect((await placeOrder(ctx, { storeId: closed._id })).body.message).toMatch(/không tồn tại hoặc đã ngừng hoạt động/);

    expect((await placeOrder(ctx, { deliveryAddress: { phone: '0900000000' } })).body.message).toMatch(/họ tên/);
    expect((await placeOrder(ctx, { deliveryAddress: { fullName: 'A', phone: '12345' } })).statusCode).toBe(400);
    const noAddress = await placeOrder(ctx, { deliveryMethod: 'home_delivery' });
    expect(noAddress.body.message).toMatch(/Giao tận nơi/);
    expect((await placeOrder(ctx, { deliveryMethod: 'bay_toi' })).statusCode).toBe(400);

    // Bị từ chối thì giỏ hàng còn nguyên; đơn hợp lệ thì tạo được
    const ok = await placeOrder(ctx, {
      deliveryMethod: 'home_delivery',
      deliveryAddress: { fullName: 'Test', phone: '0900000000', addressLine1: '1 Lê Lợi', city: 'TP. Hồ Chí Minh' }
    });
    expect(ok.statusCode).toBe(201);
  });

  test('TC-133: Đơn dùng mã giảm giá bị hủy / tự hủy thì trả lại lượt dùng của mã', async () => {
    const ctx = await setup();
    await Voucher.create({ code: 'GIAM1', discountType: 'fixed', discountValue: 10000, usageLimit: 1, startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), isActive: true });
    const used = async () => (await Voucher.findOne({ code: 'GIAM1' })).usedCount;

    await addToCart(ctx);
    const first = await placeOrder(ctx, { voucherCode: 'GIAM1' });
    expect(first.statusCode).toBe(201);
    expect(await used()).toBe(1);
    expect((await auth(request(app).put(`/api/orders/${first.body.data._id}/cancel`), ctx.customer).send({})).statusCode).toBe(200);
    expect(await used()).toBe(0);

    // Lượt đã trả nên dùng lại được; đơn online quá hạn tự hủy cũng trả lượt
    await addToCart(ctx);
    const second = await placeOrder(ctx, { voucherCode: 'GIAM1', paymentMode: 'vnpay' });
    expect(second.statusCode).toBe(201);
    expect(await used()).toBe(1);
    await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(second.body.data._id) }, { $set: { createdAt: new Date(Date.now() - 2 * 3600000) } });
    expect(await expireUnpaidVnpayOrders({ restoreStock })).toBe(1);
    expect(await used()).toBe(0);
  });
});
