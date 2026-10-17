require('./setup');
const http = require('http');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const { attachSocket } = require('../utils/socketServer');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

// Server Socket.IO THẬT trên cổng ngẫu nhiên, client kết nối như trình duyệt
let server, url;
const clients = [];
beforeAll(async () => {
  server = http.createServer(app);
  attachSocket(server, app);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await flushEmails();
});
afterAll(async () => {
  app.get('io').close();
  await new Promise((r) => server.close(r));
});

const connect = (token) =>
  new Promise((resolve) => {
    const c = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    clients.push(c);
    c.on('connect', () => setTimeout(() => resolve(c), 100)); // chờ server xếp phòng xong
  });
const nextEvent = (c, name, ms = 1500) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    c.once(name, (data) => { clearTimeout(t); resolve(data); });
  });
const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;

describe('Socket.IO (kết nối thật)', () => {
  test('TC-140: Khách nhận real-time khi đơn đổi trạng thái; bị khóa thì mất kết nối ngay', async () => {
    const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
    const product = await Product.create({ title: 'Máy RT', slug: 'may-rt', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }] });
    const store = await Store.create({ name: 'CN' });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
    const reg = await registerUser();
    const customer = reg.body.accessToken;
    await Admin.create({ name: 'Admin', email: 'admin-rt@example.com', password: 'admin123', role: 'admin' });
    const admin = await login('admin-rt@example.com', 'admin123');

    const sock = await connect(customer);
    await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
    const order = (await auth(request(app).post('/api/orders'), customer).send({
      storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
    })).body.data;

    const updated = nextEvent(sock, 'order:statusUpdated');
    await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: 'confirmed' });
    expect(await updated).toEqual({ orderId: order._id, status: 'confirmed' });

    const dropped = nextEvent(sock, 'disconnect');
    await auth(request(app).put(`/api/users/admin/${reg.body.user._id}/toggle-active`), admin).send({});
    expect(await dropped).toBe('io server disconnect');
  });
});
