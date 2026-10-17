require('./setup');
const request = require('supertest');
const mongoose = require('mongoose');
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

async function setup() {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const store = await Store.create({ name: 'CN 1' });
  await Admin.create({ name: 'Admin', email: 'admin-sp@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'admin-sp@example.com', password: 'admin123' })).body.accessToken;
  const customer = (await registerUser()).body.accessToken;
  return { category, store, admin, customer };
}

describe('Toàn vẹn dữ liệu sản phẩm và tồn kho', () => {
  test('TC-126: Thêm / sửa sản phẩm không tự đặt được "đã bán", điểm đánh giá', async () => {
    const { category, admin } = await setup();
    const created = await auth(request(app).post('/api/products'), admin).send({
      title: 'Máy thử', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }],
      soldCount: 9999, ratingAverage: 5, ratingCount: 500
    });
    expect(created.statusCode).toBe(201);
    let p = await Product.findById(created.body.data._id);
    expect([p.soldCount || 0, p.ratingAverage || 0, p.ratingCount || 0]).toEqual([0, 0, 0]);

    const updated = await auth(request(app).put(`/api/products/${p._id}`), admin).send({ title: 'Máy thử 2', soldCount: 777, ratingAverage: 4.9 });
    expect(updated.statusCode).toBe(200);
    p = await Product.findById(p._id);
    expect(p.title).toBe('Máy thử 2');
    expect([p.soldCount || 0, p.ratingAverage || 0]).toEqual([0, 0]);
  });

  test('TC-127: Chỉ người quản lý sản phẩm mới xem được sản phẩm đã ẩn (includeInactive)', async () => {
    const { category, admin, customer } = await setup();
    await Product.create({ title: 'Máy ẩn', slug: 'may-an', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }], isActive: false });

    const anon = await request(app).get('/api/products?includeInactive=true');
    expect(anon.statusCode).toBe(401);
    expect((await auth(request(app).get('/api/products?includeInactive=true'), customer)).statusCode).toBe(403);
    const asAdmin = await auth(request(app).get('/api/products?includeInactive=true'), admin);
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.body.data.map((x) => x.title)).toContain('Máy ẩn');
    // Danh sách công khai không có sản phẩm ẩn
    expect((await request(app).get('/api/products')).body.data.map((x) => x.title)).not.toContain('Máy ẩn');
  });

  test('TC-128: Khách hàng không xem được danh sách tồn kho nội bộ', async () => {
    const { customer, admin } = await setup();
    expect((await auth(request(app).get('/api/store-inventories'), customer)).statusCode).toBe(403);
    expect((await auth(request(app).get('/api/store-inventories'), admin)).statusCode).toBe(200);
  });

  test('TC-129: Tồn kho và ngưỡng cảnh báo phải là số nguyên >= 0; cửa hàng phải tồn tại', async () => {
    const { category, store, admin } = await setup();
    const product = await Product.create({ title: 'Máy kho', slug: 'may-kho', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }] });
    const base = { storeId: store._id, productId: product._id, variantId: product.variants[0]._id };
    const post = (body) => auth(request(app).post('/api/store-inventories'), admin).send({ ...base, ...body });

    expect((await post({ stock: 2.5 })).statusCode).toBe(400);
    expect((await post({ stock: -1 })).statusCode).toBe(400);
    expect((await post({ stock: 3, lowStockThreshold: 1.5 })).statusCode).toBe(400);
    expect((await post({ stock: 3, storeId: new mongoose.Types.ObjectId() })).statusCode).toBe(400);
    const ok = await post({ stock: 3, lowStockThreshold: 2 });
    expect(ok.statusCode).toBe(201);

    const put = (body) => auth(request(app).put(`/api/store-inventories/${ok.body.data._id}`), admin).send(body);
    expect((await put({ stock: 1.2 })).statusCode).toBe(400);
    expect((await put({ lowStockThreshold: -2 })).statusCode).toBe(400);
    expect((await put({ stock: 7, lowStockThreshold: 3 })).statusCode).toBe(200);
  });

  test('TC-130: Hai khách cùng đặt món hàng cuối cùng: chỉ 1 đơn thành công, tồn kho không âm', async () => {
    const { category, store } = await setup();
    const product = await Product.create({ title: 'Máy cuối', slug: 'may-cuoi', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }] });
    const variantId = product.variants[0]._id;
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId, stock: 1 });
    const buyers = [(await registerUser()).body.accessToken, (await registerUser()).body.accessToken];
    for (const t of buyers) await auth(request(app).post('/api/cart/items'), t).send({ productId: product._id, variantId, quantity: 1 });

    const results = await Promise.all(buyers.map((t) => auth(request(app).post('/api/orders'), t).send({
      storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Test', phone: '0900000000' }
    })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 400]);
    expect((await StoreInventory.findOne({ productId: product._id })).stock).toBe(0);
  });

  test('TC-131: So sánh sản phẩm: 2 – 4 sản phẩm, mã phải hợp lệ, bỏ sản phẩm đã ẩn', async () => {
    const { category } = await setup();
    const mk = (title, isActive = true) => Product.create({ title, slug: title, categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }], isActive });
    const [a, b, hidden] = [await mk('a'), await mk('b'), await mk('an', false)];
    const compare = (ids) => request(app).post('/api/products/compare').send({ ids });

    expect((await compare([String(a._id)])).statusCode).toBe(400);
    expect((await compare([a, b, a, b, a].map(String))).statusCode).toBe(400);
    expect((await compare([String(a._id), 'khong-hop-le'])).statusCode).toBe(400);
    const ok = await compare([a, b, hidden].map((p) => String(p._id)));
    expect(ok.statusCode).toBe(200);
    expect(ok.body.data.map((p) => p.title).sort()).toEqual(['a', 'b']);
  });
});

describe('Sửa tồn kho không ghi đè lần trừ kho của đơn hàng', () => {
  test('TC-142: Nhập / xuất theo chênh lệch là nguyên tử, không âm; đặt số kèm số cũ thì báo 409 khi tồn kho vừa đổi', async () => {
    const { category, store, admin } = await setup();
    const product = await Product.create({ title: 'Máy chỉnh', slug: 'may-chinh', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000 }] });
    const inv = await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 10 });
    const put = (body) => auth(request(app).put(`/api/store-inventories/${inv._id}`), admin).send(body);
    const stockNow = async () => (await StoreInventory.findById(inv._id)).stock;

    // Nhân viên thấy 10 rồi bấm +10, trong lúc đó 1 đơn trừ 3 -> kết quả đúng là 17 (không phải 20)
    await StoreInventory.updateOne({ _id: inv._id }, { $inc: { stock: -3 } });
    expect((await put({ adjust: 10 })).statusCode).toBe(200);
    expect(await stockNow()).toBe(17);

    expect((await put({ adjust: -20 })).statusCode).toBe(400); // không đủ để xuất
    expect(await stockNow()).toBe(17);
    expect((await put({ adjust: 1.5 })).statusCode).toBe(400);
    expect((await put({ adjust: -7 })).statusCode).toBe(200);
    expect(await stockNow()).toBe(10);

    // Kiểm kê: đặt 50 khi tưởng còn 12 nhưng thực tế là 10 -> 409, không ghi đè
    const conflict = await put({ stock: 50, expectedStock: 12 });
    expect(conflict.statusCode).toBe(409);
    expect(await stockNow()).toBe(10);
    expect((await put({ stock: 50, expectedStock: 10 })).statusCode).toBe(200);
    expect(await stockNow()).toBe(50);
  });
});
