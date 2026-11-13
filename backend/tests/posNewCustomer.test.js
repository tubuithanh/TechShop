// Khách mua lần đầu tại quầy: nhận diện SĐT, tạo thẻ thành viên (cần hỏi ý khách), tích điểm, gộp đơn cũ;
// khách tự gộp lịch sử online bằng mã đơn + SĐT khớp
require('./setup');
const request = require('supertest');
const crypto = require('crypto');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Inventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const WarrantyCard = require('../models/WarrantyCard');
const { registerUser } = require('./helpers');
const { flushEmails } = require('../utils/notifyEmail');

const auth = (r, t) => r.set('Authorization', `Bearer ${t}`);
afterEach(flushEmails);

async function fixture() {
  await Order.init();
  const category = await Category.create({ name: 'Test', slug: `t-${Math.random()}` });
  const product = await Product.create({ title: 'Phone', slug: `p-${Math.random()}`, categoryId: category._id, price: 1, variants: [{ color: 'Black', price: 1000000 }] });
  const variantId = product.variants[0]._id;
  const store = await Store.create({ name: 'Store' });
  await Inventory.create({ storeId: store._id, productId: product._id, variantId, stock: 20 });
  await Admin.create({ name: 'Admin', email: 'admin-pnc@qa.test', password: 'abc12345', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'admin-pnc@qa.test', password: 'abc12345' })).body.accessToken;
  const sale = (extra = {}) => auth(request(app).post('/api/orders/pos'), admin).send({
    storeId: String(store._id), fullName: 'Nguyễn Khách Mới', phone: '0912345678', paymentMode: 'cash', paymentConfirmed: true,
    clientRequestId: crypto.randomUUID(), expectedTotal: 1000000, expectedVatRate: 10,
    items: [{ productId: String(product._id), variantId: String(variantId), quantity: 1 }], ...extra
  });
  const lookup = (phone) => auth(request(app).get('/api/orders/pos/lookup-phone').query({ phone }), admin);
  return { admin, sale, lookup };
}

test('PNC-1: Khách mới -> khách cũ chưa có tài khoản -> tạo thẻ tại quầy (gộp đơn cũ, cộng điểm, sổ bảo hành) -> thành viên', async () => {
  const c = await fixture();
  expect((await c.lookup('0912345678')).body.data.status).toBe('new');

  // Mua lần 1 không tạo tài khoản
  const first = await c.sale();
  expect(first.status).toBe(201);
  const back = (await c.lookup('+84912345678')).body.data;
  expect(back).toMatchObject({ status: 'returning', guest: { orders: 1, name: 'Nguyễn Khách Mới' } });

  // Tạo thẻ phải có xác nhận đã hỏi ý khách
  expect((await c.sale({ createAccount: true })).status).toBe(400);
  const second = await c.sale({ createAccount: true, accountConsent: true, email: 'khachmoi@example.com' });
  expect(second.status).toBe(201);
  expect(second.body.data.newAccount).toMatchObject({ created: true, linkedOrders: 1, hasEmail: true });
  const user = await User.findOne({ phoneNumber: '0912345678' });
  expect(user).toMatchObject({ source: 'pos', email: 'khachmoi@example.com' });
  expect(String(second.body.data.userId)).toBe(String(user._id));
  // Cả 2 đơn thuộc tài khoản, đều được cộng điểm, sổ bảo hành chuyển theo
  const orders = await Order.find({ userId: user._id });
  expect(orders).toHaveLength(2);
  expect(orders.every((o) => o.loyaltyPoints > 0)).toBe(true);
  expect(user.loyaltyPoints).toBe(orders.reduce((s, o) => s + o.loyaltyPoints, 0));
  expect(await WarrantyCard.countDocuments({ userId: user._id })).toBe(await WarrantyCard.countDocuments({ orderId: { $in: orders.map((o) => o._id) } }));

  // Lần sau: nhận diện là thành viên, không tạo trùng tài khoản
  expect((await c.lookup('0912345678')).body.data).toMatchObject({ status: 'member', customer: { orders: 2 } });
  const third = await c.sale({ createAccount: true, accountConsent: true });
  expect(String(third.body.data.userId)).toBe(String(user._id));
  expect(await User.countDocuments({ phoneNumber: '0912345678' })).toBe(1);
});

test('PNC-2: Khách tự gộp lịch sử bằng mã đơn: SĐT phải khớp; gộp thẻ tại quầy chưa đăng nhập vào tài khoản thật', async () => {
  const c = await fixture();
  const guest = (await c.sale({ phone: '0987654321' })).body.data; // đơn không tài khoản
  const shellSale = (await c.sale({ phone: '0987654321', createAccount: true, accountConsent: true })).body.data; // thẻ tại quầy (không email)
  const shell = await User.findById(shellSale.userId);
  expect(shell.email).toBeUndefined();
  const shellPoints = shell.loyaltyPoints;
  expect(shellPoints).toBeGreaterThan(0);

  // Khách tự đăng ký online
  const reg = (await registerUser()).body;
  const claim = (code) => auth(request(app).post('/api/users/claim-pos-order'), reg.accessToken).send({ orderCode: code });
  await User.updateOne({ _id: reg.user._id }, { phoneNumber: '' });
  expect((await claim(guest.orderCode)).status).toBe(400); // chưa có SĐT trong tài khoản
  await User.updateOne({ _id: reg.user._id }, { phoneNumber: '0900000001' });
  expect((await claim(guest.orderCode)).status).toBe(404); // SĐT không khớp
  await User.updateOne({ _id: reg.user._id }, { phoneNumber: '0987654321' });
  const ok = await claim(`#${guest.orderCode.toLowerCase()}`);
  expect(ok.status).toBe(200);
  expect(ok.body.data.orders).toBe(2);
  const me = await User.findById(reg.user._id);
  expect(me.loyaltyPoints).toBe(shellPoints); // thẻ tại quầy đã gồm điểm cả 2 đơn (đơn cũ được gộp lúc tạo thẻ)
  expect(await Order.countDocuments({ userId: reg.user._id })).toBe(2);
  expect(await User.findById(shell._id)).toMatchObject({ isActive: false, loyaltyPoints: 0 });
  expect(String((await User.findById(shell._id)).mergedInto)).toBe(String(reg.user._id));
  expect((await claim(guest.orderCode)).body.data.orders).toBe(0); // gộp lại không cộng thêm
});

test('PNC-3: Gợi ý mã giảm giá cho khách tại quầy: số tiền giảm, sắp xếp có lợi nhất, bỏ mã hết lượt, gợi ý mua thêm', async () => {
  const c = await fixture();
  const Voucher = require('../models/Voucher');
  const reg = (await registerUser()).body;
  const product = await Product.findOne();
  const variantId = String(product.variants[0]._id);
  const day = 86400000;
  const base = { startDate: new Date(Date.now() - day), endDate: new Date(Date.now() + day), minOrderValue: 0, usageLimit: 0 };
  await Voucher.create([
    { ...base, code: 'GIAM10', discountType: 'percent', discountValue: 10, maxDiscountAmount: 150000 }, // 10% của 2tr = 200k -> trần 150k
    { ...base, code: 'TRU300', discountType: 'fixed', discountValue: 300000 },
    { ...base, code: 'MUANHIEU', discountType: 'fixed', discountValue: 500000, minOrderValue: 3000000 }, // thiếu 1tr
    { ...base, code: 'DADUNG', discountType: 'fixed', discountValue: 900000, perCustomerLimit: 1 },
    { ...base, code: 'HETHAN', discountType: 'fixed', discountValue: 900000, endDate: new Date(Date.now() - 1000) }
  ]);
  await Order.create({ orderCode: `X-${Math.random()}`, userId: reg.user._id, storeId: (await Store.findOne())._id, status: 'delivered', paymentMode: 'cash', voucherCode: 'DADUNG', items: [{ productId: product._id, quantity: 1, unitPrice: 1 }], itemsTotal: 1, grandTotal: 1 });
  const res = await auth(request(app).post('/api/orders/pos/vouchers'), c.admin).send({
    storeId: String((await Store.findOne())._id), userId: reg.user._id, items: [{ productId: String(product._id), variantId, quantity: 2 }]
  });
  expect(res.status).toBe(200);
  expect(res.body.data.eligible.map((v) => [v.code, v.amount])).toEqual([['TRU300', 300000], ['GIAM10', 150000]]);
  expect(res.body.data.nearly).toEqual([expect.objectContaining({ code: 'MUANHIEU', missing: 1000000 })]);
});

test('PNC-4: Chỉ gợi ý 3 mã có lợi nhất; khách online nhận gợi ý theo giỏ hàng của mình', async () => {
  const c = await fixture();
  const Voucher = require('../models/Voucher');
  const reg = (await registerUser()).body;
  const product = await Product.findOne();
  const variantId = String(product.variants[0]._id);
  const day = 86400000;
  const base = { startDate: new Date(Date.now() - day), endDate: new Date(Date.now() + day), discountType: 'fixed', perCustomerLimit: 0 };
  await Voucher.create([100000, 200000, 300000, 400000, 500000].map((v, i) => ({ ...base, code: `M${i}`, discountValue: v })));
  const pos = await auth(request(app).post('/api/orders/pos/vouchers'), c.admin).send({ userId: reg.user._id, items: [{ productId: String(product._id), variantId, quantity: 1 }] });
  expect(pos.body.data.eligible.map((v) => v.code)).toEqual(['M4', 'M3', 'M2']);
  expect(pos.body.data.total).toBe(5);

  await auth(request(app).post('/api/cart/items'), reg.accessToken).send({ productId: product._id, variantId, quantity: 1 });
  const online = await auth(request(app).get('/api/vouchers/suggest'), reg.accessToken);
  expect(online.status).toBe(200);
  expect(online.body.data.eligible.map((v) => [v.code, v.amount])).toEqual([['M4', 500000], ['M3', 400000], ['M2', 300000]]);
  expect((await auth(request(app).get('/api/vouchers/suggest'), c.admin)).status).toBe(403);
});

test('PNC-5: Ví voucher cá nhân hóa: dùng ngay / sắp hết hạn / sắp diễn ra / mở khóa theo hạng / đã dùng', async () => {
  await fixture();
  const Voucher = require('../models/Voucher');
  const reg = (await registerUser()).body;
  const day = 86400000;
  const b = { startDate: new Date(Date.now() - day), endDate: new Date(Date.now() + 30 * day), discountType: 'fixed', discountValue: 100000 };
  await Voucher.create([
    { ...b, code: 'READY' },
    { ...b, code: 'SOON', endDate: new Date(Date.now() + day) },
    { ...b, code: 'LATER', startDate: new Date(Date.now() + 5 * day) },
    { ...b, code: 'VIPONLY', tierKeys: ['vang'] },          // khách mới hạng Đồng -> chờ mở khóa
    { ...b, code: 'DONGONLY', tierKeys: ['dong'] },         // đúng hạng -> dùng được
    { ...b, code: 'ONCE', perCustomerLimit: 1 },            // đã dùng hết lượt của mình -> ẩn
    { ...b, code: 'OFF', isActive: false }
  ]);
  await Order.create({ orderCode: `V-${Math.random()}`, userId: reg.user._id, storeId: (await Store.findOne())._id, status: 'delivered', paymentMode: 'cash', voucherCode: 'ONCE', voucherDiscount: 100000, items: [{ productId: (await Product.findOne())._id, quantity: 1, unitPrice: 1 }], itemsTotal: 1, grandTotal: 1 });
  const res = await auth(request(app).get('/api/vouchers/mine'), reg.accessToken);
  expect(res.status).toBe(200);
  const d = res.body.data;
  const codes = (k) => d[k].map((v) => v.code).sort();
  expect(codes('ready')).toEqual(['DONGONLY', 'READY']);
  expect(codes('expiring')).toEqual(['SOON']);
  expect(codes('upcoming')).toEqual(['LATER']);
  expect(d.locked).toEqual([expect.objectContaining({ code: 'VIPONLY', unlockTier: 'Vàng' })]);
  expect(d.used).toEqual([expect.objectContaining({ code: 'ONCE', times: 1, saved: 100000 })]);
  expect(d.totalSaved).toBe(100000);
});
