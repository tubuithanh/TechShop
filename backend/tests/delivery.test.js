require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const PermissionGroup = require('../models/PermissionGroup');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Setting = require('../models/Setting');
const Order = require('../models/Order');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(() => flushEmails());
const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'abc12345' })).body.accessToken;

// 2 chi nhánh; quản lý chi nhánh 1; 2 nhân viên giao hàng (chi nhánh 1 và chi nhánh 2); 1 nhân viên bán hàng
async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy giao', slug: 'may-giao', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 2000000 }] });
  const variantId = product.variants[0]._id;
  const [store1, store2] = await Store.create([{ name: 'CN 1' }, { name: 'CN 2' }]);
  await StoreInventory.create({ storeId: store1._id, productId: product._id, variantId, stock: 10 });
  const manage = await PermissionGroup.create({ name: 'Quản lý giao', permissions: ['deliveries.manage', 'orders.manage'] });
  const perform = await PermissionGroup.create({ name: 'Giao hàng', permissions: ['deliveries.perform'] });
  const sales = await PermissionGroup.create({ name: 'Bán', permissions: ['orders.manage'] });
  const mk = (email, groupIds, storeId) => Admin.create({ name: email.split('@')[0], email, password: 'abc12345', role: 'staff', groupIds, storeId });
  const shipper = await mk('ship1@example.com', [perform._id], store1._id);
  const otherShipper = await mk('ship2@example.com', [perform._id], store2._id);
  const seller = await mk('ban@example.com', [sales._id], store1._id);
  await mk('quanly@example.com', [manage._id], store1._id);
  const customer = (await registerUser()).body.accessToken;
  const t = { manager: await login('quanly@example.com'), ship: await login('ship1@example.com'), ship2: await login('ship2@example.com'), seller: await login('ban@example.com') };

  // Khách đặt đơn giao tận nơi, COD; quản lý xác nhận và chuẩn bị hàng
  const placeOrder = async (quantity = 1) => {
    await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId, quantity });
    const order = (await auth(request(app).post('/api/orders'), customer).send({
      storeId: store1._id, deliveryMethod: 'home_delivery', paymentMode: 'cod',
      deliveryAddress: { fullName: 'Khách', phone: '0900000000', addressLine1: '1 Lê Lợi', city: 'TP. Hồ Chí Minh' }
    })).body.data;
    for (const s of ['confirmed', 'processing']) await auth(request(app).put(`/api/orders/${order._id}/status`), t.manager).send({ status: s });
    return order;
  };
  return { t, customer, shipper, otherShipper, seller, placeOrder, stock: async () => (await StoreInventory.findOne({ productId: product._id })).stock };
}

describe('Giao nhận hàng (UC37 – UC40)', () => {
  test('TC-145: Phân công đúng người, nhân viên giao hàng lấy hàng, giao thành công, thu COD, quản lý đối soát', async () => {
    const { t, customer, shipper, otherShipper, seller, placeOrder } = await setup();
    const order = await placeOrder();
    const assign = (token, shipperId) => auth(request(app).put(`/api/deliveries/${order._id}/assign`), token).send({ shipperId });

    // Chỉ người có deliveries.manage phân công; chỉ chọn được nhân viên giao hàng của đúng chi nhánh
    expect((await assign(t.seller, String(shipper._id))).statusCode).toBe(403);
    expect((await assign(t.manager, String(otherShipper._id))).statusCode).toBe(400);
    expect((await assign(t.manager, String(seller._id))).statusCode).toBe(400);
    const shippers = (await auth(request(app).get('/api/deliveries/shippers'), t.manager)).body.data.map((s) => s.name);
    expect(shippers).toEqual(['ship1']);
    expect((await assign(t.manager, String(shipper._id))).statusCode).toBe(200);

    // Nhân viên giao hàng khác / khách hàng không thao tác được
    expect((await auth(request(app).post(`/api/deliveries/${order._id}/pickup`), t.ship2)).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/deliveries/mine'), customer)).statusCode).toBe(403);

    const mine = (await auth(request(app).get('/api/deliveries/mine'), t.ship)).body.data;
    expect(mine.active.map((o) => o.orderCode)).toEqual([order.orderCode]);
    expect((await auth(request(app).post(`/api/deliveries/${order._id}/pickup`), t.ship)).body.data.status).toBe('shipping');
    // Đã rời chi nhánh thì không đổi người giao được nữa
    expect((await assign(t.manager, null)).statusCode).toBe(400);

    const done = await auth(request(app).post(`/api/deliveries/${order._id}/result`), t.ship).send({ result: 'success' });
    expect(done.body.data).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(done.body.data.codCollectedAt).toBeTruthy();

    const cod = (await auth(request(app).get('/api/deliveries/mine'), t.ship)).body.data;
    expect(cod.codTotal).toBe(order.grandTotal);
    expect((await auth(request(app).get('/api/deliveries?view=cod'), t.manager)).body.data).toHaveLength(1);
    expect((await auth(request(app).post(`/api/deliveries/${order._id}/settle-cod`), t.manager)).statusCode).toBe(200);
    expect((await auth(request(app).post(`/api/deliveries/${order._id}/settle-cod`), t.manager)).statusCode).toBe(400); // chỉ 1 lần
    expect((await auth(request(app).get('/api/deliveries/mine'), t.ship)).body.data.codTotal).toBe(0);
  });

  test('TC-146: Giao thất bại: hẹn lại thì vẫn đang giao; khách từ chối hoặc quá số lần tối đa thì trả hàng và hoàn kho', async () => {
    const { t, shipper, placeOrder, stock } = await setup();
    await Setting.create({ maxDeliveryAttempts: 2 });
    const start = async () => {
      const order = await placeOrder();
      await auth(request(app).put(`/api/deliveries/${order._id}/assign`), t.manager).send({ shipperId: String(shipper._id) });
      await auth(request(app).post(`/api/deliveries/${order._id}/pickup`), t.ship);
      return order;
    };
    const report = (order, body) => auth(request(app).post(`/api/deliveries/${order._id}/result`), t.ship).send(body);

    const a = await start();
    expect((await report(a, { result: 'failed' })).statusCode).toBe(400); // bắt buộc lý do
    const first = await report(a, { result: 'failed', reason: 'Không liên lạc được' });
    expect(first.body.data.status).toBe('shipping');
    expect(first.body.data.deliveryAttempts).toHaveLength(1);
    expect(await stock()).toBe(9);
    const second = await report(a, { result: 'failed', reason: 'Khách hẹn hôm khác' });
    expect(second.body.data.status).toBe('returned'); // đủ 2 lần
    expect(await stock()).toBe(10);

    const b = await start();
    const refused = await report(b, { result: 'failed', reason: 'Đổi ý', refused: true });
    expect(refused.body.data.status).toBe('returned');
    expect(await stock()).toBe(10);
    expect((await Order.findById(b._id)).codCollectedAt).toBeFalsy();
  });
});
