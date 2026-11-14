// Rà soát giai đoạn 2 (mua hàng - thanh toán): các lỗi phát hiện khi chú thích từng dòng code
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Promotion = require('../models/Promotion');
const Cart = require('../models/Cart');
const { registerUser } = require('./helpers');
const { flushEmails } = require('../utils/notifyEmail');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
afterEach(() => flushEmails());

describe('Giai đoạn 2 - mua hàng', () => {
  test('P2-1: nhiều request mở giỏ cùng lúc lần đầu không lỗi 500, chỉ tạo 1 giỏ', async () => {
    const token = (await registerUser()).body.accessToken;
    const results = await Promise.all(Array.from({ length: 5 }, () => auth(request(app).get('/api/cart'), token)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await Cart.countDocuments()).toBe(1);
  });

  test('P2-2: ghi chú đơn hàng sai kiểu / quá dài bị từ chối', async () => {
    const category = await Category.create({ name: 'ĐT', slug: 'dt-p2' });
    const product = await Product.create({ title: 'Máy', slug: 'may-p2', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 100000 }] });
    const store = await Store.create({ name: 'CN P2' });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
    const token = (await registerUser()).body.accessToken;
    await auth(request(app).post('/api/cart/items'), token).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
    const base = { storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'A', phone: '0900000000' } };
    expect((await auth(request(app).post('/api/orders'), token).send({ ...base, note: { x: 1 } })).status).toBe(400);
    expect((await auth(request(app).post('/api/orders'), token).send({ ...base, note: 'a'.repeat(501) })).status).toBe(400);
    const ok = await auth(request(app).post('/api/orders'), token).send({ ...base, note: '  Gọi trước khi tới  ' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.note).toBe('Gọi trước khi tới');
  });

  test('P2-3: không hạ ngân sách khuyến mãi xuống dưới số tiền đã giảm', async () => {
    await Admin.create({ name: 'Admin', email: 'p2@t.vn', password: 'abc12345', role: 'admin' });
    const token = (await request(app).post('/api/auth/login').send({ email: 'p2@t.vn', password: 'abc12345' })).body.accessToken;
    const promo = await Promotion.create({ name: 'Giảm hè', discountType: 'fixed', discountValue: 10000, scope: 'all', budget: 1000000, usedAmount: 500000, startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
    const low = await auth(request(app).put(`/api/promotions/${promo._id}`), token).send({ budget: 400000 });
    expect(low.status).toBe(400);
    const okRes = await auth(request(app).put(`/api/promotions/${promo._id}`), token).send({ budget: 600000 });
    expect(okRes.status).toBe(200);
  });
});
