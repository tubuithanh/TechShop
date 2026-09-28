require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Otp = require('../models/Otp');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const MailConfig = require('../models/MailConfig');
const { encrypt, signPayload } = require('../utils/secretBox');
const { clearMailConfigCache } = require('../utils/mailer');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

// Bắt mọi email gửi qua Resend (giả lập) để kiểm tra nội dung
let sent;
let realFetch;
beforeEach(async () => {
  sent = [];
  realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    if (String(url) === 'https://api.resend.com/emails') {
      sent.push(JSON.parse(opts.body));
      return { ok: true, status: 200, text: async () => '' };
    }
    return realFetch(url, opts);
  };
  await MailConfig.create({ provider: 'resend', resendApiKeyEnc: encrypt('re_test'), from: 'TechShop <no-reply@shop.vn>' });
  clearMailConfigCache();
});
afterEach(async () => {
  await flushEmails();
  global.fetch = realFetch;
});

const mailsTo = (email) => sent.filter((m) => m.to.includes(email));

describe('Quên mật khẩu', () => {
  test('TC-65: Email chưa đăng ký -> vẫn trả lời chung, không tạo mã, không gửi email', async () => {
    const res = await request(app).post('/api/auth/password/request-otp').send({ email: 'khong-ton-tai@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/Nếu email này đã đăng ký/);
    expect(await Otp.countDocuments()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test('TC-66: Đặt lại mật khẩu bằng mã qua email: kiểm tra mã, mật khẩu mới, mã chỉ dùng 1 lần', async () => {
    const email = 'quen-mk@example.com';
    await registerUser({ email, password: 'matkhau123' });
    sent.length = 0;
    const req = await request(app).post('/api/auth/password/request-otp').send({ email });
    expect(req.statusCode).toBe(200);
    const mail = mailsTo(email)[0];
    expect(mail.subject).toMatch(/^\d{6} là mã đặt lại mật khẩu/);
    const code = mail.subject.slice(0, 6);

    const reset = (body) => request(app).post('/api/auth/password/reset').send({ email, ...body });
    expect((await reset({ code: '000000', newPassword: 'moimoi123', confirmPassword: 'moimoi123' })).statusCode).toBe(400);
    expect((await reset({ code, newPassword: 'ngan1', confirmPassword: 'ngan1' })).statusCode).toBe(400);
    expect((await reset({ code, newPassword: 'moimoi123', confirmPassword: 'khac12345' })).statusCode).toBe(400);
    const ok = await reset({ code, newPassword: 'moimoi123', confirmPassword: 'moimoi123' });
    expect(ok.statusCode).toBe(200);
    expect((await reset({ code, newPassword: 'lanhai123', confirmPassword: 'lanhai123' })).statusCode).toBe(400); // mã đã dùng

    expect((await request(app).post('/api/auth/login').send({ email, password: 'matkhau123' })).statusCode).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'moimoi123' })).statusCode).toBe(200);
  });

  test('TC-67: Nhập sai mã quá 5 lần -> khóa mã, phải xin mã mới', async () => {
    const email = 'sai-nhieu@example.com';
    await registerUser({ email });
    await request(app).post('/api/auth/password/request-otp').send({ email });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/password/reset').send({ email, code: '111111', newPassword: 'moimoi123' });
    }
    const code = mailsTo(email).at(-1).subject.slice(0, 6);
    const res = await request(app).post('/api/auth/password/reset').send({ email, code, newPassword: 'moimoi123' });
    expect(res.statusCode).toBe(429);
  });
});

describe('Email đơn hàng, thanh toán, bảo hành', () => {
  async function setup() {
    const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
    const product = await Product.create({
      title: 'iPhone 15', slug: 'iphone-15', categoryId: category._id, price: 1, warrantyMonths: 12,
      variants: [{ color: 'Đen', storage: '128GB', price: 20000000 }]
    });
    const store = await Store.create({ name: 'Chi nhánh A' });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
    const email = 'khach.mua@example.com';
    const token = (await registerUser({ email, displayName: 'Trần Khách' })).body.accessToken;
    await Admin.create({ name: 'Admin', email: 'admin-noti@example.com', password: 'admin123', role: 'admin' });
    const adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin-noti@example.com', password: 'admin123' })).body.accessToken;
    const as = (t) => ({ post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${t}`).send(b || {}), put: (u, b) => request(app).put(u).set('Authorization', `Bearer ${t}`).send(b || {}) });
    await as(token).post('/api/cart/items', { productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
    const order = (await as(token).post('/api/orders', { storeId: store._id, deliveryMethod: 'store_pickup', paymentMode: 'cod', deliveryAddress: { fullName: 'Trần Khách', phone: '0912345678' } })).body.data;
    return { email, order, product, customer: as(token), admin: as(adminToken) };
  }

  test('TC-68: Đặt hàng -> email xác nhận có mã đơn, sản phẩm, tổng tiền, link xem đơn', async () => {
    const { email, order } = await setup();
    await flushEmails();
    const mail = mailsTo(email).find((m) => m.subject.includes('Xác nhận đơn hàng'));
    expect(mail.subject).toContain(order.orderCode);
    expect(mail.html).toContain('iPhone 15');
    expect(mail.html).toContain('Đen - 128GB');
    expect(mail.html).toContain(order.grandTotal.toLocaleString('vi-VN'));
    expect(mail.html).toContain(`/account/orders/${order._id}`);
  });

  test('TC-69: Đổi trạng thái đơn -> email cho khách (không gửi cho bước chờ xác nhận); khách hủy -> email', async () => {
    const { email, order, admin, customer } = await setup();
    await admin.put(`/api/orders/${order._id}/status`, { status: 'confirmed' });
    await flushEmails();
    expect(mailsTo(email).some((m) => m.subject === `Đơn hàng ${order.orderCode}: Đã xác nhận - TechShop`)).toBe(true);
    await customer.put(`/api/orders/${order._id}/cancel`, { reason: 'Đổi ý' });
    await flushEmails();
    const cancelled = mailsTo(email).find((m) => m.subject.includes('Đã hủy'));
    expect(cancelled.html).toContain('Đổi ý');
  });

  test('TC-70: Thanh toán VNPay thành công -> email xác nhận thanh toán', async () => {
    const { email, order } = await setup();
    await Order.updateOne({ _id: order._id }, { paymentMode: 'vnpay', 'paymentInfo.txnRefs': ['REF1'], 'paymentInfo.txnRef': 'REF1' });
    process.env.VNP_TMN_CODE = 'T';
    process.env.VNP_HASH_SECRET = 'S';
    const { signedQuery } = require('../utils/vnpay');
    const params = { vnp_Amount: String(order.grandTotal * 100), vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TxnRef: 'REF1', vnp_TransactionNo: '999', vnp_BankCode: 'NCB' };
    const { query, hash } = signedQuery(params, 'S');
    await request(app).get(`/api/payments/vnpay/ipn?${query}&vnp_SecureHash=${hash}`);
    await flushEmails();
    const mail = mailsTo(email).find((m) => m.subject.startsWith('Thanh toán thành công'));
    expect(mail.html).toContain('999');
  });

  test('TC-71: Bảo hành: tạo phiếu và đổi trạng thái -> email kèm mã phiếu và link tra cứu', async () => {
    const { email, order, product, admin, customer } = await setup();
    await Order.updateOne({ _id: order._id }, { status: 'delivered', $push: { statusHistory: { status: 'delivered', changedAt: new Date() } } });
    const w = (await customer.post('/api/warranties', { orderId: order._id, productId: product._id, issueDescription: 'Màn hình nhấp nháy' })).body.data;
    expect(w.ticketCode).toBeTruthy();
    await admin.put(`/api/warranties/${w._id}/status`, { status: 'repairing', note: 'Đang thay màn hình' });
    await flushEmails();
    const created = mailsTo(email).find((m) => m.subject.startsWith('Đã tiếp nhận yêu cầu bảo hành'));
    expect(created.html).toContain(w.ticketCode);
    expect(created.html).toContain(`/tra-cuu-bao-hanh?code=${w.ticketCode}`);
    const updated = mailsTo(email).find((m) => m.subject.includes('Đang sửa chữa'));
    expect(updated.html).toContain('Đang thay màn hình');
  });

  test('TC-72: Gửi email lỗi không làm hỏng đặt hàng', async () => {
    const { product, customer } = await setup();
    global.fetch = async () => ({ ok: false, status: 500, text: async () => 'lỗi máy chủ mail' }); // máy chủ mail hỏng
    await customer.post('/api/cart/items', { productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
    const res = await customer.post('/api/orders', {
      storeId: (await Store.findOne())._id,
      deliveryMethod: 'store_pickup',
      paymentMode: 'cod',
      deliveryAddress: { fullName: 'Trần Khách', phone: '0912345678' }
    });
    expect(res.statusCode).toBe(201);
    await flushEmails(); // lỗi gửi chỉ được ghi log, không ném ra ngoài
    expect(await Order.countDocuments()).toBe(2);
  });
});
