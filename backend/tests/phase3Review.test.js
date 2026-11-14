// Rà soát giai đoạn 3 (xử lý đơn - giao hàng): các lỗi phát hiện khi chú thích từng dòng code
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { registerUser } = require('./helpers');
const { flushEmails } = require('../utils/notifyEmail');
const { expireUnpaidVnpayOrders } = require('../utils/expireUnpaidOrders');
const { restoreStock } = require('../controllers/orderController');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
afterEach(() => flushEmails());

async function setup() {
  const category = await Category.create({ name: 'ĐT', slug: `dt-${Math.random()}` });
  const product = await Product.create({ title: 'Máy', slug: `m-${Math.random()}`, categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 100000 }] });
  const store = await Store.create({ name: 'CN P3' });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
  const customer = (await registerUser()).body.accessToken;
  await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
  return { store, customer };
}

describe('Giai đoạn 3 - xử lý đơn', () => {
  test('P3-1: ghi chú khi đổi trạng thái sai kiểu / quá dài bị từ chối', async () => {
    const { store, customer } = await setup();
    const order = (await auth(request(app).post('/api/orders'), customer).send({ storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'A', phone: '0900000000' } })).body.data;
    await Admin.create({ name: 'Admin', email: 'p3@t.vn', password: 'abc12345', role: 'admin' });
    const admin = (await request(app).post('/api/auth/login').send({ email: 'p3@t.vn', password: 'abc12345' })).body.accessToken;
    expect((await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: 'confirmed', note: { a: 1 } })).status).toBe(400);
    expect((await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: 'confirmed', note: 'x'.repeat(501) })).status).toBe(400);
    expect((await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: 'confirmed', note: 'OK' })).status).toBe(200);
  });

  test('P3-2: thông báo đơn tự hủy (quá hạn thanh toán) trỏ đúng trang chi tiết đơn của khách', async () => {
    const { store, customer } = await setup();
    const order = (await auth(request(app).post('/api/orders'), customer).send({ storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'vnpay', deliveryAddress: { fullName: 'A', phone: '0900000000' } })).body.data;
    await Order.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(order._id) }, { $set: { createdAt: new Date(Date.now() - 2 * 3600000) } });
    expect(await expireUnpaidVnpayOrders({ restoreStock })).toBe(1);
    const note = await Notification.findOne({ title: 'Đơn hàng đã hủy' });
    expect(note.link).toBe(`/account/orders/${order._id}`);
  });
});
