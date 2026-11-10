require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Voucher = require('../models/Voucher');
const Promotion = require('../models/Promotion');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const DAY = 864e5;
const rnd = () => Math.random().toString(36).slice(2);

async function setup() {
  await Admin.create({ name: 'Admin', email: 'adminpromo@example.com', password: 'admin123', role: 'admin' });
  const reg = await registerUser();
  const phone = await Category.create({ name: 'Điện thoại', slug: `dt-${rnd()}` });
  const laptop = await Category.create({ name: 'Laptop', slug: `lt-${rnd()}` });
  const apple = await Brand.create({ name: 'Apple', slug: `apple-${rnd()}` });
  const mk = (title, categoryId, price, brandId) =>
    Product.create({ title, slug: `${rnd()}`, categoryId, brandId, price: 1, variants: [{ color: 'Đen', price }] });
  const p1 = await mk('Điện thoại A', phone._id, 10000000, apple._id); // 10tr
  const p2 = await mk('Laptop B', laptop._id, 20000000); // 20tr
  const store1 = await Store.create({ name: `CN1 ${rnd()}` });
  const store2 = await Store.create({ name: `CN2 ${rnd()}` });
  for (const s of [store1, store2]) for (const p of [p1, p2]) {
    await StoreInventory.create({ storeId: s._id, productId: p._id, variantId: p.variants[0]._id, stock: 10 });
  }
  const customer = reg.body.accessToken;
  for (const p of [p1, p2]) {
    await auth(request(app).post('/api/cart/items'), customer).send({ productId: p._id, variantId: p.variants[0]._id, quantity: 1 });
  }
  const quote = (body) => auth(request(app).post('/api/orders/quote'), customer).send({ storeId: store1._id, deliveryMethod: 'store_pickup', ...body });
  return { admin: await login('adminpromo@example.com', 'admin123'), customer, userId: reg.body.user._id, phone, laptop, apple, p1, p2, store1, store2, quote };
}
// Giỏ đã được dùng để đặt đơn -> thêm lại 2 sản phẩm (tổng 30tr)
async function setup2(c) {
  for (const p of [c.p1, c.p2]) {
    await auth(request(app).post('/api/cart/items'), c.customer).send({ productId: p._id, variantId: p.variants[0]._id, quantity: 1 });
  }
  return { quote: () => c.quote({}) };
}
const running = { startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY) };

describe('Khuyến mãi tự động và phạm vi mã giảm giá', () => {
  test('PROMO-1: Giảm theo danh mục, thương hiệu, từng sản phẩm; mỗi dòng nhận mức giảm cao nhất', async () => {
    const c = await setup();
    await Promotion.create([
      { name: 'Tuần lễ điện thoại', campaign: 'Facebook', discountType: 'percent', discountValue: 10, scope: 'categories', categoryIds: [c.phone._id], ...running },
      { name: 'Apple Days', discountType: 'fixed', discountValue: 1500000, scope: 'brands', brandIds: [c.apple._id], ...running },
      { name: 'Xả laptop', discountType: 'percent', discountValue: 50, maxDiscountPerItem: 3000000, scope: 'products', productIds: [c.p2._id], ...running },
      { name: 'Đã tắt', discountType: 'percent', discountValue: 80, scope: 'all', isActive: false, ...running },
      { name: 'Hết hạn', discountType: 'percent', discountValue: 80, scope: 'all', startDate: new Date(Date.now() - 3 * DAY), endDate: new Date(Date.now() - DAY) }
    ]);
    const q = (await c.quote({})).body.data;
    // Điện thoại: max(10% = 1tr, Apple 1.5tr) = 1.5tr; Laptop: 50% nhưng trần 3tr
    expect(q.promotionDiscount).toBe(4500000);
    expect(q.grandTotal).toBe(30000000 - 4500000);
    expect(q.promotions.map((p) => p.name).sort()).toEqual(['Apple Days', 'Xả laptop']);
    // VAT tính trên số tiền sau giảm của từng dòng
    expect(q.items.map((i) => i.discountAmount)).toEqual([1500000, 3000000]);
    expect(q.vat.taxableTotal).toBe(25500000);

    // Đặt hàng thật lưu đúng khuyến mãi
    const order = await auth(request(app).post('/api/orders'), c.customer).send({
      storeId: c.store1._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'A', phone: '0900000000' }
    });
    expect(order.statusCode).toBe(201);
    expect(order.body.data).toMatchObject({ promotionDiscount: 4500000, voucherDiscount: 0, discountAmount: 4500000, grandTotal: 25500000 });
  });

  test('PROMO-2: Giảm theo chi nhánh và hạng khách hàng', async () => {
    const c = await setup();
    await Promotion.create([
      { name: 'Khai trương CN2', discountType: 'percent', discountValue: 10, scope: 'all', storeIds: [c.store2._id], ...running },
      { name: 'Tri ân hạng Vàng', discountType: 'percent', discountValue: 20, scope: 'all', tierKeys: ['vang', 'kim_cuong'], ...running }
    ]);
    expect((await c.quote({})).body.data.promotionDiscount).toBe(0); // CN1, hạng Đồng
    expect((await c.quote({ storeId: c.store2._id })).body.data.promotionDiscount).toBe(3000000);
    await User.updateOne({ _id: c.userId }, { loyaltyPoints: 2500 }); // lên hạng Vàng
    const q = (await c.quote({})).body.data;
    expect(q.tier.key).toBe('vang');
    expect(q.promotionDiscount).toBe(6000000);
  });

  test('PROMO-3: Mã giảm giá theo danh mục / sản phẩm / chi nhánh / hạng; cộng thêm sau khuyến mãi', async () => {
    const c = await setup();
    const end = new Date(Date.now() + DAY);
    await Voucher.create([
      { code: 'LAPTOP10', discountType: 'percent', discountValue: 10, categoryIds: [c.laptop._id], endDate: end },
      { code: 'GIAM5TR', discountType: 'fixed', discountValue: 50000000, productIds: [c.p1._id], endDate: end },
      { code: 'CN2ONLY', discountType: 'fixed', discountValue: 100000, storeIds: [c.store2._id], endDate: end },
      { code: 'VIP', discountType: 'fixed', discountValue: 100000, tierKeys: ['kim_cuong'], endDate: end },
      { code: 'TABLET', discountType: 'fixed', discountValue: 100000, categoryIds: [c.apple._id], endDate: end }
    ]);
    await Promotion.create({ name: 'Laptop -2tr', discountType: 'fixed', discountValue: 2000000, scope: 'products', productIds: [c.p2._id], ...running });

    // 10% trên tiền laptop SAU khuyến mãi (18tr) = 1.8tr, chỉ chia cho dòng laptop
    const q = (await c.quote({ voucherCode: 'LAPTOP10' })).body.data;
    expect(q).toMatchObject({ promotionDiscount: 2000000, voucherDiscount: 1800000, discountAmount: 3800000 });
    expect(q.items.map((i) => i.discountAmount)).toEqual([0, 3800000]);
    // Mã cố định theo sản phẩm không giảm quá tiền sản phẩm đó (10tr), không trừ sang sản phẩm khác
    expect((await c.quote({ voucherCode: 'GIAM5TR' })).body.data.voucherDiscount).toBe(10000000);

    expect((await c.quote({ voucherCode: 'CN2ONLY' })).body.message).toMatch(/chi nhánh/);
    expect((await c.quote({ voucherCode: 'CN2ONLY', storeId: c.store2._id })).body.data.voucherDiscount).toBe(100000);
    expect((await c.quote({ voucherCode: 'VIP' })).body.message).toMatch(/hạng/);
    expect((await c.quote({ voucherCode: 'TABLET' })).body.message).toMatch(/phạm vi/);

    // Bước "Áp dụng" mã cũng kiểm tra phạm vi theo giỏ hàng thật
    const validate = (body) => auth(request(app).post('/api/vouchers/validate'), c.customer).send({ orderValue: 30000000, ...body });
    expect((await validate({ code: 'LAPTOP10' })).body.data.discountAmount).toBe(1800000); // giống lúc đặt hàng: tính sau khuyến mãi
    expect((await validate({ code: 'VIP' })).statusCode).toBe(400);
    expect((await validate({ code: 'CN2ONLY', storeId: String(c.store1._id) })).statusCode).toBe(400);
  });

  test('PROMO-5: Tổng tiền đổi giữa lúc xem và lúc đặt -> từ chối; tắt tích điểm thì bỏ ưu đãi theo hạng', async () => {
    const c = await setup();
    const shown = (await c.quote({})).body.data.grandTotal; // 30tr, chưa có khuyến mãi
    // Khuyến mãi bắt đầu ngay sau khi khách xem tổng tiền
    await Promotion.create({ name: 'Flash sale', discountType: 'percent', discountValue: 10, scope: 'all', ...running });
    const place = (expectedTotal) => auth(request(app).post('/api/orders'), c.customer).send({
      storeId: c.store1._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'A', phone: '0900000000' }, expectedTotal
    });
    const stale = await place(shown);
    expect(stale.statusCode).toBe(409);
    expect(stale.body.message).toMatch(/27\.000\.000/);
    expect((await place('abc')).statusCode).toBe(400);
    expect((await place(27000000)).statusCode).toBe(201);

    // Ưu đãi hạng Vàng không áp dụng khi chương trình thành viên bị tắt
    const c2 = await setup2(c);
    await Promotion.create({ name: 'VIP', discountType: 'percent', discountValue: 20, scope: 'all', tierKeys: ['vang'], ...running });
    await User.updateOne({ _id: c.userId }, { loyaltyPoints: 2500 });
    expect((await c2.quote()).body.data.promotionDiscount).toBe(6000000); // flash 10% < VIP 20% -> 20%
    expect((await auth(request(app).put('/api/settings/loyalty'), c.admin).send({ enabled: false })).statusCode).toBe(200);
    const q = (await c2.quote()).body.data;
    expect(q.tier).toBeNull();
    expect(q.promotionDiscount).toBe(3000000); // chỉ còn flash sale 10%

    // Voucher không nhận hạng không tồn tại
    const bad = await auth(request(app).post('/api/vouchers'), c.admin).send({
      code: 'BADTIER', discountType: 'fixed', discountValue: 1000, endDate: new Date(Date.now() + DAY).toISOString(), tierKeys: ['khong_co']
    });
    expect(bad.statusCode).toBe(400);
  });

  test('PROMO-6: Số suất và ngân sách chiến dịch: hết thì ngừng áp dụng; hủy đơn trả lại suất', async () => {
    const c = await setup();
    // 1 suất; và ngân sách 4tr cho chương trình 20% (đơn 30tr cần 6tr -> vượt ngân sách -> không áp dụng)
    const one = await Promotion.create({ name: 'Một suất', discountType: 'fixed', discountValue: 500000, scope: 'all', usageLimit: 1, ...running });
    await Promotion.create({ name: 'Ngân sách nhỏ', discountType: 'percent', discountValue: 20, scope: 'all', budget: 4000000, ...running });
    const q = (await c.quote({})).body.data;
    expect(q.promotions.map((p) => p.name)).toEqual(['Một suất']);
    expect(q.promotionDiscount).toBe(1000000);
    const place = () => auth(request(app).post('/api/orders'), c.customer).send({
      storeId: c.store1._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'A', phone: '0900000000' }
    });
    const first = await place();
    expect(first.statusCode).toBe(201);
    expect(await Promotion.findById(one._id).lean()).toMatchObject({ usedCount: 1, usedAmount: 1000000 });
    await setup2(c);
    expect((await c.quote({})).body.data.promotionDiscount).toBe(0); // hết suất
    // Hủy đơn -> trả suất
    expect((await auth(request(app).put(`/api/orders/${first.body.data._id}/cancel`), c.customer).send({ reason: 'Đổi ý' })).statusCode).toBe(200);
    expect(await Promotion.findById(one._id).lean()).toMatchObject({ usedCount: 0, usedAmount: 0 });
    expect((await c.quote({})).body.data.promotionDiscount).toBe(1000000);
  });

  test('PROMO-4: Quản trị chương trình khuyến mãi: kiểm tra dữ liệu, phân quyền, tắt thay vì xóa', async () => {
    const c = await setup();
    const create = (body, t = c.admin) => auth(request(app).post('/api/promotions'), t).send({
      name: 'Back to School', discountType: 'percent', discountValue: 10, scope: 'categories', categoryIds: [c.laptop._id],
      startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * DAY).toISOString(), ...body
    });
    expect((await create({}, c.customer)).statusCode).toBe(403);
    for (const bad of [{ discountValue: 95 }, { discountValue: 0 }, { scope: 'categories', categoryIds: [] }, { tierKeys: ['khong_co'] },
      { categoryIds: ['abc'] }, { endDate: new Date(Date.now() - DAY).toISOString() }, { name: 'ab' }]) {
      expect((await create(bad)).statusCode).toBe(400);
    }
    expect((await create({ budget: -1 })).statusCode).toBe(400);
    const ok = await create({ productIds: [c.p1._id], tierKeys: ['vang'], usageLimit: 100, budget: 5000000, usedCount: 99 });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.data.productIds).toEqual([]); // phạm vi là danh mục -> bỏ danh sách sản phẩm thừa
    expect(ok.body.data).toMatchObject({ usageLimit: 100, budget: 5000000, usedCount: 0 }); // không sửa được số đã dùng
    const id = ok.body.data._id;
    expect((await auth(request(app).put(`/api/promotions/${id}`), c.admin).send({ discountValue: 15 })).body.data.discountValue).toBe(15);
    const list = (await auth(request(app).get('/api/promotions?state=running'), c.admin)).body.data;
    expect(list[0]).toMatchObject({ name: 'Back to School', stats: { orders: 0, discount: 0 } });
    expect((await auth(request(app).delete(`/api/promotions/${id}`), c.admin)).statusCode).toBe(200);
    expect((await Promotion.findById(id)).isActive).toBe(false);
    // Voucher lưu phạm vi
    const v = await auth(request(app).post('/api/vouchers'), c.admin).send({
      code: 'CNONLY', discountType: 'fixed', discountValue: 1000, endDate: new Date(Date.now() + DAY).toISOString(),
      storeIds: [c.store1._id], categoryIds: [c.phone._id], tierKeys: ['bac']
    });
    expect(v.statusCode).toBe(201);
    expect(v.body.data.storeIds).toHaveLength(1);
    expect(v.body.data.tierKeys).toEqual(['bac']);
  });
});
