require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const PermissionGroup = require('../models/PermissionGroup');
const { flushEmails } = require('../utils/notifyEmail');
const { migrateLoyalty } = require('../utils/migrateLoyalty');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
afterEach(() => flushEmails());
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;

const TIERS = [
  { key: 'dong', name: 'Đồng', minPoints: 0, color: '#b87333' },
  { key: 'bac', name: 'Bạc', minPoints: 500, color: '#8a9099' },
  { key: 'vang', name: 'Vàng', minPoints: 2000, color: '#d4a017' },
  { key: 'kim_cuong', name: 'Kim cương', minPoints: 5000, color: '#3fa7d6' }
];

async function setup() {
  await Admin.create({ name: 'Admin', email: 'admin-loyalty@example.com', password: 'admin123', role: 'admin' });
  const group = await PermissionGroup.create({ name: 'CSKH', permissions: ['customers.view'] });
  await Admin.create({ name: 'NV', email: 'nv-loyalty@example.com', password: 'abc12345', role: 'staff', groupIds: [group._id] });
  const reg = await registerUser();
  return {
    admin: await login('admin-loyalty@example.com', 'admin123'),
    staff: await login('nv-loyalty@example.com', 'abc12345'),
    customer: reg.body.accessToken,
    userId: reg.body.user._id
  };
}
const put = (t, body) => auth(request(app).put('/api/settings/loyalty'), t).send(body);
const myLoyalty = async (t) => (await auth(request(app).get('/api/users/loyalty'), t)).body.data;

// Giao 1 đơn 6.000.000đ cho khách (qua API, như thật)
async function deliverOrder(ctx) {
  const category = await Category.create({ name: `DM ${Math.random()}`, slug: `dm-${Math.random().toString(36).slice(2)}` });
  const product = await Product.create({ title: 'Máy', slug: `may-${Math.random().toString(36).slice(2)}`, categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 3000000 }] });
  const store = await Store.create({ name: `CN ${Math.random()}` });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 10 });
  await auth(request(app).post('/api/cart/items'), ctx.customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 2 });
  const order = (await auth(request(app).post('/api/orders'), ctx.customer).send({
    storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
  })).body.data;
  for (const s of ['confirmed', 'processing', 'ready_for_pickup']) {
    expect((await auth(request(app).put(`/api/orders/${order._id}/status`), ctx.admin).send({ status: s })).statusCode).toBe(200);
  }
  expect((await auth(request(app).post(`/api/orders/${order._id}/handover`), ctx.admin).send({ recipientName: 'Test', paymentConfirmed: true })).statusCode).toBe(200);
  return order;
}

describe('Cấu hình hạng thành viên (admin)', () => {
  test('TC-165: Chỉ admin xem / đổi; dữ liệu sai bị từ chối; PUT /settings không lách được', async () => {
    const ctx = await setup();
    expect((await auth(request(app).get('/api/settings/loyalty'), ctx.staff)).statusCode).toBe(403);
    expect((await put(ctx.customer, { enabled: false })).statusCode).toBe(403);

    const res = await auth(request(app).get('/api/settings/loyalty'), ctx.admin);
    expect(res.body.data).toMatchObject({ enabled: true, pointValue: 10000, tiers: TIERS });

    const bad = [
      { pointValue: 0 }, { pointValue: 500.5 }, { enabled: 'no' },
      { tiers: [TIERS[0]] }, // < 2 hạng
      { tiers: [{ ...TIERS[0], minPoints: 10 }, TIERS[1]] }, // hạng đầu phải từ 0
      { tiers: [TIERS[0], TIERS[2], TIERS[1]] }, // không tăng dần
      { tiers: [TIERS[0], { ...TIERS[1], name: 'đồng' }] }, // trùng tên
      { tiers: [TIERS[0], { ...TIERS[1], color: 'red' }] },
      { tiers: [TIERS[0], { ...TIERS[1], name: '  ' }] }
    ];
    for (const body of bad) expect((await put(ctx.admin, body)).statusCode).toBe(400);

    // Ghi thẳng qua PUT /settings (không kiểm tra) bị bỏ qua
    await auth(request(app).put('/api/settings'), ctx.admin).send({ loyalty: { pointValue: 1, tiers: [] } });
    expect((await auth(request(app).get('/api/settings/loyalty'), ctx.admin)).body.data.pointValue).toBe(10000);
  });

  test('TC-166: Xem trước đếm đúng khách lên / xuống hạng; lưu xong hạng của khách đổi ngay', async () => {
    const ctx = await setup();
    await User.updateOne({ _id: ctx.userId }, { loyaltyPoints: 600 }); // Bạc
    const [u2, u3] = await Promise.all([registerUser({ email: 'u2@example.com', phoneNumber: '0912345678' }), registerUser({ email: 'u3@example.com', phoneNumber: '0912345679' })]);
    await User.updateOne({ _id: u2.body.user._id }, { loyaltyPoints: 2500 }); // Vàng
    await User.updateOne({ _id: u3.body.user._id }, { loyaltyPoints: 100 }); // Đồng

    // Hạ Bạc xuống 100 điểm (u3 lên Bạc), nâng Vàng lên 3000 (u2 xuống Bạc), thêm hạng "Bạch kim"
    const next = [TIERS[0], { ...TIERS[1], minPoints: 100 }, { ...TIERS[2], minPoints: 3000 }, { key: '', name: 'Bạch kim', minPoints: 4000, color: '#e5e4e2' }, TIERS[3]];
    const preview = (await auth(request(app).post('/api/settings/loyalty/preview'), ctx.admin).send({ tiers: next })).body.data;
    expect(preview).toMatchObject({ up: 1, down: 1, total: 3 });
    expect(preview.next.map((t) => [t.key, t.count])).toEqual([['dong', 0], ['bac', 3], ['vang', 0], ['bach_kim', 0], ['kim_cuong', 0]]);

    const saved = await put(ctx.admin, { tiers: next });
    expect(saved.statusCode).toBe(200);
    expect(saved.body.data.tiers[3]).toMatchObject({ key: 'bach_kim', name: 'Bạch kim' });
    expect(await myLoyalty(u2.body.accessToken)).toMatchObject({ key: 'bac', next: { key: 'vang', pointsNeeded: 500 } });
    const list = (await auth(request(app).get('/api/users/admin/all'), ctx.admin)).body.data;
    expect(list.find((c) => c._id === u3.body.user._id).tier.name).toBe('Bạc');
  });

  test('TC-167: Đổi tỷ lệ chỉ áp dụng cho đơn giao sau đó; tắt tích điểm -> không cộng, giữ điểm cũ, không cộng bù', async () => {
    const ctx = await setup();
    await put(ctx.admin, { pointValue: 20000 });
    const first = await deliverOrder(ctx); // 6.000.000 / 20.000 = 300
    expect((await Order.findById(first._id)).loyaltyPoints).toBe(300);

    const off = await put(ctx.admin, { enabled: false });
    expect(off.body.message).toMatch(/TẮT/);
    expect((await request(app).get('/api/settings')).body.data.loyalty.enabled).toBe(false); // giao diện khách ẩn mục hạng
    await deliverOrder(ctx);
    expect((await User.findById(ctx.userId)).loyaltyPoints).toBe(300);
    expect(await myLoyalty(ctx.customer)).toMatchObject({ enabled: false, points: 300 });

    // Đơn cũ chưa xét: đang tắt thì không cộng bù
    await Order.collection.insertOne({ orderCode: 'OLDX', userId: ctx.userId, status: 'delivered', items: [], itemsTotal: 1000000, discountAmount: 0, grandTotal: 1000000 });
    expect(await migrateLoyalty()).toMatchObject({ skipped: true });
    expect((await User.findById(ctx.userId)).loyaltyPoints).toBe(300);

    // Trả hàng vẫn trừ đúng số đã cộng dù đang tắt
    expect((await auth(request(app).put(`/api/orders/${first._id}/status`), ctx.admin).send({ status: 'returning', note: 'Khách trả' })).statusCode).toBe(200);
    expect((await auth(request(app).post(`/api/orders/${first._id}/receive-return`), ctx.admin).send({ received: true })).statusCode).toBe(200);
    expect((await User.findById(ctx.userId)).loyaltyPoints).toBe(0);
  });
});
