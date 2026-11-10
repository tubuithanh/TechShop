require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const WarrantyCard = require('../models/WarrantyCard');
const WarrantyPlan = require('../models/WarrantyPlan');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const DAY = 864e5;
const rnd = () => Math.random().toString(36).slice(2);

async function setup() {
  await Admin.create({ name: 'Admin', email: 'adminwc@example.com', password: 'admin123', role: 'admin' });
  const phoneNumber = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const reg = await registerUser({ phoneNumber });
  const category = await Category.create({ name: 'Điện thoại', slug: `dt-${rnd()}` });
  const brand = await Brand.create({ name: 'Apple', warrantyCenter: { name: 'Apple Care VN', phone: '1800 1127', lookupUrl: 'https://checkcoverage.apple.com' } });
  const mk = (over) => Product.create({ title: `SP ${rnd()}`, slug: rnd(), categoryId: category._id, brandId: brand._id, price: 1, variants: [{ color: 'Đen', price: 10000000 }], ...over });
  const store = await Store.create({ name: `CN ${rnd()}` });
  const admin = await login('adminwc@example.com', 'admin123');
  const customer = reg.body.accessToken;

  // Mua và nhận hàng tại cửa hàng (đi qua đúng luồng thật để sổ bảo hành được tạo khi giao thành công)
  async function buy(product, quantity = 1) {
    await StoreInventory.updateOne({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id }, { $inc: { stock: 10 } }, { upsert: true });
    await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity });
    const order = (await auth(request(app).post('/api/orders'), customer).send({
      storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Khách A', phone: phoneNumber }
    })).body.data;
    for (const s of ['confirmed', 'processing', 'ready_for_pickup']) {
      await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: s });
    }
    expect((await auth(request(app).post(`/api/orders/${order._id}/handover`), admin).send({ recipientName: 'Khách A', paymentConfirmed: true })).statusCode).toBe(200);
    return order;
  }
  return { admin, customer, phoneNumber, userId: reg.body.user._id, category, brand, store, mk, buy };
}

describe('Sổ bảo hành điện tử', () => {
  test('WC-1: Giao thành công tạo 1 sổ / máy (12 tháng từ ngày mua); tra cứu công khai cần đúng SĐT', async () => {
    const c = await setup();
    const product = await c.mk({});
    const order = await c.buy(product, 2);
    const cards = await WarrantyCard.find({ orderId: order._id });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ baseMonths: 12, startFrom: 'purchase', provider: 'store' });

    const look = (q, phone) => request(app).get('/api/warranty-cards/lookup').query({ q, phone });
    const byOrder = await look(order.orderCode, c.phoneNumber);
    expect(byOrder.statusCode).toBe(200);
    expect(byOrder.body.data).toHaveLength(2);
    expect(byOrder.body.data[0]).toMatchObject({ state: 'active', inWarranty: true, totalMonths: 12 });
    expect(byOrder.body.data[0].customerPhone).toMatch(/\*\*\*\*/); // SĐT được che
    expect(byOrder.body.data[0].daysLeft).toBeGreaterThan(360);
    expect((await look(order.orderCode, '0911111111')).statusCode).toBe(404);
    expect((await look(cards[0].code, c.phoneNumber)).body.data).toHaveLength(1);

    // Nhân viên nhập IMEI -> tra cứu bằng IMEI
    expect((await auth(request(app).put(`/api/warranty-cards/admin/${cards[0]._id}`), c.admin).send({ serial: 'IMEI 123' })).statusCode).toBe(400);
    expect((await auth(request(app).put(`/api/warranty-cards/admin/${cards[0]._id}`), c.admin).send({ serial: '356789012345678' })).statusCode).toBe(200);
    expect((await auth(request(app).put(`/api/warranty-cards/admin/${cards[1]._id}`), c.admin).send({ serial: '356789012345678' })).statusCode).toBe(409);
    expect((await look('356789012345678', c.phoneNumber)).body.data[0].code).toBe(cards[0].code);
  });

  test('WC-2: Bảo hành tính từ ngày kích hoạt (trong 30 ngày); bảo hành do hãng có thông tin trung tâm hãng', async () => {
    const c = await setup();
    const product = await c.mk({ warrantyStartFrom: 'activation', warrantyProvider: 'manufacturer', warrantyMonths: 24 });
    const order = await c.buy(product);
    const card = await WarrantyCard.findOne({ orderId: order._id });
    expect(card.providerInfo).toMatchObject({ name: 'Apple Care VN', lookupUrl: 'https://checkcoverage.apple.com' });
    // Giả lập: mua cách đây 10 ngày
    card.purchaseDate = new Date(Date.now() - 10 * DAY);
    card.activationDeadline = new Date(Date.now() + 20 * DAY);
    await card.save();

    const mine = (await auth(request(app).get('/api/warranty-cards/mine'), c.customer)).body.data;
    expect(mine[0]).toMatchObject({ state: 'pending_activation', canActivate: true, provider: 'manufacturer' });
    const act = await auth(request(app).post(`/api/warranty-cards/${card._id}/activate`), c.customer);
    expect(act.statusCode).toBe(200);
    // Bắt đầu từ hôm nay chứ không phải 10 ngày trước
    expect(new Date(act.body.data.startDate).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect(act.body.data.state).toBe('active');
    expect((await auth(request(app).post(`/api/warranty-cards/${card._id}/activate`), c.customer)).statusCode).toBe(409);

    // Quá hạn kích hoạt
    const order2 = await c.buy(product);
    const late = await WarrantyCard.findOne({ orderId: order2._id });
    late.activationDeadline = new Date(Date.now() - DAY);
    await late.save();
    expect((await auth(request(app).post(`/api/warranty-cards/${late._id}/activate`), c.customer)).statusCode).toBe(400);

    // Admin đổi thông tin trung tâm bảo hành của hãng -> sổ cũ cập nhật theo
    const upd = await auth(request(app).put(`/api/warranty-cards/admin/brands/${c.brand._id}/center`), c.admin).send({ name: 'Apple VN mới', phone: '1800', lookupUrl: 'javascript:alert(1)' });
    expect(upd.statusCode).toBe(400);
    await auth(request(app).put(`/api/warranty-cards/admin/brands/${c.brand._id}/center`), c.admin).send({ name: 'Apple VN mới', phone: '1800' });
    expect((await WarrantyCard.findById(card._id)).providerInfo.name).toBe('Apple VN mới');
    // Hãng quản lý -> không bán gói gia hạn của cửa hàng
    const plan = await WarrantyPlan.create({ name: '+12 tháng', months: 12, pricePercent: 5, minPrice: 300000 });
    expect((await auth(request(app).post(`/api/warranty-cards/${card._id}/extensions`), c.customer).send({ planId: plan._id })).body.message).toMatch(/hãng/);
  });

  test('WC-3: Mua thêm thời gian bảo hành: khách đăng ký -> nhân viên xác nhận thu tiền -> cộng tháng', async () => {
    const c = await setup();
    const product = await c.mk({});
    const order = await c.buy(product);
    const card = await WarrantyCard.findOne({ orderId: order._id });
    const plan = await WarrantyPlan.create({ name: '+12 tháng', months: 12, pricePercent: 5, minPrice: 300000 });
    await WarrantyPlan.create({ name: 'Chỉ laptop', months: 6, fixedPrice: 100000, categoryIds: [await Category.create({ name: 'LT', slug: rnd() }).then((x) => x._id)] });

    const plans = (await auth(request(app).get(`/api/warranty-cards/${card._id}/plans`), c.customer)).body.data;
    expect(plans).toHaveLength(1); // gói laptop không áp dụng
    expect(plans[0]).toMatchObject({ months: 12, price: 500000 }); // 5% của 10tr

    const req1 = await auth(request(app).post(`/api/warranty-cards/${card._id}/extensions`), c.customer).send({ planId: plan._id, channel: 'bank_transfer' });
    expect(req1.statusCode).toBe(201);
    expect(req1.body.data.totalMonths).toBe(12); // chưa thanh toán -> chưa cộng
    expect((await auth(request(app).post(`/api/warranty-cards/${card._id}/extensions`), c.customer).send({ planId: plan._id })).statusCode).toBe(409);
    const extId = req1.body.data.extensions[0]._id;

    // Khách khác không thao tác được sổ này
    const other = (await registerUser()).body.accessToken;
    expect((await auth(request(app).post(`/api/warranty-cards/${card._id}/activate`), other)).statusCode).toBe(404);
    expect((await auth(request(app).post(`/api/warranty-cards/admin/${card._id}/extensions/${extId}/confirm`), c.customer)).statusCode).toBe(403);

    const ok = await auth(request(app).post(`/api/warranty-cards/admin/${card._id}/extensions/${extId}/confirm`), c.admin).send({ note: 'CK VCB' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.data).toMatchObject({ totalMonths: 24, extendedMonths: 12 });
    expect((await auth(request(app).post(`/api/warranty-cards/admin/${card._id}/extensions/${extId}/confirm`), c.admin)).statusCode).toBe(400);

    // Bán tại quầy: phải xác nhận đã thu tiền
    expect((await auth(request(app).post(`/api/warranty-cards/admin/${card._id}/extensions`), c.admin).send({ planId: plan._id })).statusCode).toBe(400);
    const sold = await auth(request(app).post(`/api/warranty-cards/admin/${card._id}/extensions`), c.admin).send({ planId: plan._id, paymentConfirmed: true });
    expect(sold.body.data.totalMonths).toBe(36);

    // Máy hết bảo hành -> không bán gói online
    await WarrantyCard.updateOne({ _id: card._id }, { purchaseDate: new Date(Date.now() - 4 * 366 * DAY) });
    expect((await auth(request(app).post(`/api/warranty-cards/${card._id}/extensions`), c.customer).send({ planId: plan._id })).body.message).toMatch(/hết bảo hành/);
  });

  test('WC-4: Phiếu sửa chữa dùng hạn trong sổ (gồm gia hạn); đơn cũ tạo bù sổ', async () => {
    const c = await setup();
    const product = await c.mk({});
    const order = await c.buy(product);
    // Đã mua 13 tháng trước -> hết 12 tháng cơ bản
    await WarrantyCard.updateMany({ orderId: order._id }, { purchaseDate: new Date(Date.now() - 395 * DAY) });
    const ticket = () => auth(request(app).post('/api/warranties'), c.customer).send({ orderId: order._id, productId: product._id, issueDescription: 'Lỗi màn hình' });
    expect((await ticket()).body.message).toMatch(/hết hạn bảo hành/);
    // Có gói gia hạn đã thanh toán -> còn bảo hành
    await WarrantyCard.updateOne({ orderId: order._id }, { $push: { extensions: { planName: '+12', months: 12, price: 1, status: 'paid' } } });
    expect((await ticket()).statusCode).toBe(201);

    // Đơn đã giao từ trước khi có tính năng: chưa có sổ -> tra cứu sẽ tạo bù theo ngày giao
    const legacy = await Order.create({
      orderCode: `OLD${rnd()}`, userId: c.userId, storeId: c.store._id, paymentMode: 'cod', status: 'delivered', paymentStatus: 'paid',
      deliveryAddress: { fullName: 'A', phone: c.phoneNumber },
      items: [{ productId: product._id, variantId: product.variants[0]._id, quantity: 1, unitPrice: 10000000, name: 'Máy cũ' }],
      itemsTotal: 10000000, grandTotal: 10000000, statusHistory: [{ status: 'delivered', changedAt: new Date(Date.now() - 400 * DAY) }]
    });
    const res = await request(app).get('/api/warranty-cards/lookup').query({ q: legacy.orderCode, phone: c.phoneNumber });
    expect(res.body.data[0]).toMatchObject({ state: 'expired', inWarranty: false });
  });

  test('WC-5: Tiếp nhận tại quầy theo sổ (IMEI): lưu tình trạng bảo hành; hết hạn chỉ nhận khi là sửa dịch vụ có tính phí', async () => {
    const c = await setup();
    const product = await c.mk({});
    const order = await c.buy(product, 2);
    const [a, b] = await WarrantyCard.find({ orderId: order._id }).sort({ unitIndex: 1 });
    await auth(request(app).put(`/api/warranty-cards/admin/${a._id}`), c.admin).send({ serial: 'IMEI-A-001' });

    // Nhân viên tìm bằng IMEI
    const found = (await auth(request(app).get('/api/warranty-cards/admin').query({ q: 'IMEI-A-001' }), c.admin)).body.data;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ _id: String(a._id), inWarranty: true });

    const create = (body) => auth(request(app).post('/api/warranties'), c.admin).send({ issueDescription: 'Không lên nguồn', ...body });
    const t1 = await create({ cardId: a._id });
    expect(t1.statusCode).toBe(201);
    expect(t1.body.data.coverage).toMatchObject({ type: 'in_warranty', cardCode: a.code, serial: 'IMEI-A-001' });
    expect((await create({ cardId: a._id })).statusCode).toBe(409); // máy A đang có phiếu
    expect((await create({ cardId: b._id })).statusCode).toBe(201); // máy B cùng loại vẫn gửi được

    // Máy hết hạn: nhân viên phải chọn sửa dịch vụ; khách tự gửi thì bị chặn
    const order2 = await c.buy(product);
    const old = await WarrantyCard.findOne({ orderId: order2._id });
    await WarrantyCard.updateOne({ _id: old._id }, { purchaseDate: new Date(Date.now() - 400 * DAY) });
    const refused = await create({ cardId: old._id });
    expect(refused.statusCode).toBe(400);
    expect(refused.body.code).toBe('OUT_OF_WARRANTY');
    expect((await auth(request(app).post('/api/warranties'), c.customer).send({ orderId: order2._id, productId: product._id, issueDescription: 'x' })).statusCode).toBe(400);
    const paid = await create({ cardId: old._id, paidService: true });
    expect(paid.statusCode).toBe(201);
    expect(paid.body.data.coverage.type).toBe('out_of_warranty');

    const list = (await auth(request(app).get('/api/warranties/admin/all').query({ coverage: 'out_of_warranty' }), c.admin)).body.data;
    expect(list.map((w) => w.ticketCode)).toEqual([paid.body.data.ticketCode]);
  });
});
