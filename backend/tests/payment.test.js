require('./setup');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const { signedQuery } = require('../utils/vnpay');
const { registerUser } = require('./helpers');

// Thông số VNPay giả để kiểm thử ký/xác minh chữ ký (không gọi tới VNPay thật)
process.env.VNP_TMN_CODE = 'TESTCODE';
process.env.VNP_HASH_SECRET = 'TESTSECRETKEY';

async function setup(stock = 5) {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({
    title: 'Điện thoại test',
    slug: 'dien-thoai-test',
    categoryId: category._id,
    price: 1,
    variants: [
      { color: 'Đen', storage: '128GB', price: 1000000 },
      { color: 'Trắng', storage: '128GB', price: 1000000 }
    ]
  });
  const store = await Store.create({ name: 'Cửa hàng test' });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock });
  const token = (await registerUser()).body.accessToken;
  return { product, store, token, variant: product.variants[0] };
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function placeVnpayOrder({ product, store, token, variant }) {
  await auth(request(app).post('/api/cart/items'), token).send({ productId: product._id, variantId: variant._id, quantity: 1 });
  const res = await auth(request(app).post('/api/orders'), token).send({
    storeId: store._id,
    deliveryMethod: 'store_pickup',
    paymentMode: 'vnpay',
    deliveryAddress: { fullName: 'Test', phone: '0900000000' }
  });
  return res.body.data;
}

// Giả lập dữ liệu VNPay trả về (có chữ ký hợp lệ) cho 1 giao dịch
function vnpayResponse(txnRef, amount, responseCode = '00') {
  const params = {
    vnp_Amount: String(amount * 100),
    vnp_BankCode: 'NCB',
    vnp_ResponseCode: responseCode,
    vnp_TmnCode: 'TESTCODE',
    vnp_TransactionNo: '14000001',
    vnp_TransactionStatus: responseCode,
    vnp_TxnRef: txnRef
  };
  const { query, hash } = signedQuery(params, 'TESTSECRETKEY');
  return `?${query}&vnp_SecureHash=${hash}`;
}

describe('Thanh toán VNPay', () => {
  test('TC-21: Tạo link thanh toán có chữ ký, đúng số tiền', async () => {
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    const res = await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    expect(res.statusCode).toBe(200);
    const url = new URL(res.body.data.paymentUrl);
    expect(url.searchParams.get('vnp_Amount')).toBe(String(order.grandTotal * 100));
    expect(url.searchParams.get('vnp_SecureHash')).toMatch(/^[0-9a-f]{128}$/);
  });

  test('TC-22: Kết quả thành công (chữ ký đúng) -> đơn "đã thanh toán", gọi lại lần 2 không đổi', async () => {
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    const { paymentInfo } = await Order.findById(order._id);
    const q = vnpayResponse(paymentInfo.txnRef, order.grandTotal);
    const res = await request(app).get(`/api/payments/vnpay/return${q}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.success).toBe(true);
    const ipn = await request(app).get(`/api/payments/vnpay/ipn${q}`);
    expect(ipn.body.RspCode).toBe('02'); // đã xác nhận trước đó
    expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
  });

  test('TC-23: Chữ ký sai hoặc sai số tiền -> không ghi nhận thanh toán', async () => {
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    const { paymentInfo } = await Order.findById(order._id);
    const tampered = vnpayResponse(paymentInfo.txnRef, order.grandTotal).replace('vnp_ResponseCode=00', 'vnp_ResponseCode=24');
    expect((await request(app).get(`/api/payments/vnpay/return${tampered}`)).statusCode).toBe(400);
    const wrongAmount = await request(app).get(`/api/payments/vnpay/ipn${vnpayResponse(paymentInfo.txnRef, 1000)}`);
    expect(wrongAmount.body.RspCode).toBe('04');
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
  });

  test('TC-24: Khách hủy thanh toán -> "thất bại", thanh toán lại được; hủy đơn đã trả tiền -> hoàn tiền', async () => {
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    let { paymentInfo } = await Order.findById(order._id);
    await request(app).get(`/api/payments/vnpay/return${vnpayResponse(paymentInfo.txnRef, order.grandTotal, '24')}`);
    expect((await Order.findById(order._id)).paymentStatus).toBe('failed');

    const retry = await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    expect(retry.statusCode).toBe(200);
    ({ paymentInfo } = await Order.findById(order._id));
    await request(app).get(`/api/payments/vnpay/return${vnpayResponse(paymentInfo.txnRef, order.grandTotal)}`);
    expect((await Order.findById(order._id)).paymentStatus).toBe('paid');

    const cancel = await auth(request(app).put(`/api/orders/${order._id}/cancel`), ctx.token).send({});
    expect(cancel.body.data.paymentStatus).toBe('refunded');
  });

  test('TC-29: Thanh toán lại rồi hoàn tất ở lần thử CŨ -> vẫn ghi nhận đúng đơn; kết quả lỗi cũ không đè', async () => {
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    const firstRef = (await Order.findById(order._id)).paymentInfo.txnRef;
    await new Promise((r) => setTimeout(r, 5)); // mã giao dịch mới khác mã cũ
    await auth(request(app).post(`/api/payments/vnpay/${order._id}`), ctx.token);
    const secondRef = (await Order.findById(order._id)).paymentInfo.txnRef;
    expect(secondRef).not.toBe(firstRef);

    // Lần thử mới đang chờ: kết quả "hủy" của lần cũ không được đánh dấu thất bại
    await request(app).get(`/api/payments/vnpay/ipn${vnpayResponse(firstRef, order.grandTotal, '24')}`);
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
    // Khách hoàn tất thanh toán ở tab cũ -> vẫn tìm ra đơn và ghi nhận
    const ipn = await request(app).get(`/api/payments/vnpay/ipn${vnpayResponse(firstRef, order.grandTotal)}`);
    expect(ipn.body.RspCode).toBe('00');
    expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
  });

  test('TC-30: Admin không xác nhận được đơn VNPay chưa thanh toán, nhưng hủy được', async () => {
    const Admin = require('../models/Admin');
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    await Admin.create({ name: 'Admin test', email: 'admin-test@example.com', password: 'admin123', role: 'admin' });
    const adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin-test@example.com', password: 'admin123' })).body.accessToken;
    const confirm = await auth(request(app).put(`/api/orders/${order._id}/status`), adminToken).send({ status: 'confirmed' });
    expect(confirm.statusCode).toBe(400);
    const cancel = await auth(request(app).put(`/api/orders/${order._id}/status`), adminToken).send({ status: 'cancelled' });
    expect(cancel.statusCode).toBe(200);
  });

  test('TC-25: Không cho tạo link thanh toán cho đơn của người khác', async () => {
    const ctx = await setup();
    const order = await placeVnpayOrder(ctx);
    const other = (await registerUser()).body.accessToken;
    const res = await auth(request(app).post(`/api/payments/vnpay/${order._id}`), other);
    expect(res.statusCode).toBe(404);
  });
});

describe('Giỏ hàng cảnh báo phiên bản ngừng bán / hết hàng', () => {
  test('TC-26: Giỏ hàng gắn trạng thái từng dòng, cho giảm số lượng về mức còn hàng', async () => {
    const ctx = await setup(3);
    const add = await auth(request(app).post('/api/cart/items'), ctx.token).send({
      productId: ctx.product._id,
      variantId: ctx.variant._id,
      quantity: 3
    });
    expect(add.body.data.items[0].availability).toBe('ok');

    // Kho giảm còn 1 -> dòng hàng báo "không đủ hàng" và chặn thanh toán
    await StoreInventory.updateOne({ variantId: ctx.variant._id }, { stock: 1 });
    let cart = (await auth(request(app).get('/api/cart'), ctx.token)).body.data;
    expect(cart.items[0].availability).toBe('out_of_stock');
    expect(cart.items[0].stock).toBe(1);
    expect(cart.hasUnavailable).toBe(true);

    // Giảm số lượng luôn được phép, kể cả khi vẫn còn cao hơn tồn kho
    const dec = await auth(request(app).put(`/api/cart/items/${cart.items[0]._id}`), ctx.token).send({ quantity: 2 });
    expect(dec.statusCode).toBe(200);
    const dec2 = await auth(request(app).put(`/api/cart/items/${cart.items[0]._id}`), ctx.token).send({ quantity: 1 });
    expect(dec2.body.data.hasUnavailable).toBe(false);

    // Admin ngừng bán phiên bản -> dòng hàng báo "ngừng bán"
    await Product.updateOne({ _id: ctx.product._id, 'variants._id': ctx.variant._id }, { $set: { 'variants.$.isActive': false } });
    cart = (await auth(request(app).get('/api/cart'), ctx.token)).body.data;
    expect(cart.items[0].availability).toBe('unavailable');
  });
});

describe('Upload ảnh', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  test('TC-27: Tải ảnh lên (lưu local khi chưa cấu hình Cloudinary) và mở được link ảnh', async () => {
    const { token } = await setup();
    const res = await auth(request(app).post('/api/uploads'), token).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(201);
    const url = new URL(res.body.data.urls[0]);
    const img = await request(app).get(url.pathname);
    expect(img.statusCode).toBe(200);
    fs.unlinkSync(path.join(__dirname, '..', url.pathname));
  });

  test('TC-28: Từ chối file không phải ảnh và khi chưa đăng nhập', async () => {
    const { token } = await setup();
    const bad = await auth(request(app).post('/api/uploads'), token).attach('images', Buffer.from('hello'), {
      filename: 'a.txt',
      contentType: 'text/plain'
    });
    expect(bad.statusCode).toBe(400);
    const anon = await request(app).post('/api/uploads').attach('images', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(anon.statusCode).toBe(401);
  });
});
