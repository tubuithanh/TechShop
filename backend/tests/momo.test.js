require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const PaymentConfig = require('../models/PaymentConfig');
const momo = require('../utils/momo');
const { expireUnpaidOnlineOrders } = require('../utils/expireUnpaidOrders');
const { restoreStock } = require('../controllers/orderController');
const { flushEmails } = require('../utils/notifyEmail');
const { registerUser } = require('./helpers');

// Khóa MoMo giả để kiểm thử ký/xác minh (KHÔNG gọi tới MoMo thật - lời gọi tạo thanh toán được giả lập)
const KEYS = { MOMO_PARTNER_CODE: 'TESTPARTNER', MOMO_ACCESS_KEY: 'TESTACCESS', MOMO_SECRET_KEY: 'TESTSECRET' };
const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
let createCalls;

beforeEach(() => {
  Object.assign(process.env, KEYS);
  momo.clearMomoConfigCache();
  createCalls = [];
  // Giả lập API tạo thanh toán của MoMo: kiểm tra chữ ký như MoMo, trả payUrl
  const realFetch = global.fetch;
  jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
    if (!String(url).includes('/v2/gateway/api/create')) return realFetch(url, opts);
    const body = JSON.parse(opts.body);
    createCalls.push(body);
    return new Response(JSON.stringify({ resultCode: 0, message: 'Thành công.', payUrl: `https://test-payment.momo.vn/pay?o=${body.orderId}`, orderId: body.orderId }), { status: 200 });
  });
});
afterEach(() => {
  Object.keys(KEYS).forEach((k) => delete process.env[k]);
  jest.restoreAllMocks();
});

async function setup(price = 1000000) {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy MoMo', slug: 'may-momo', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price }] });
  const store = await Store.create({ name: 'CN MoMo' });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
  const token = (await registerUser()).body.accessToken;
  return { product, store, token, variant: product.variants[0] };
}
async function placeMomoOrder({ product, store, token, variant }) {
  await auth(request(app).post('/api/cart/items'), token).send({ productId: product._id, variantId: variant._id, quantity: 1 });
  const res = await auth(request(app).post('/api/orders'), token).send({
    storeId: store._id,
    deliveryMethod: 'store_pickup',
    paymentMode: 'momo',
    deliveryAddress: { fullName: 'Test', phone: '0900000000' }
  });
  return res.body.data;
}

// Kết quả MoMo gửi về (redirect/IPN) có chữ ký hợp lệ
function momoResult(orderId, amount, resultCode = 0, secret = 'TESTSECRET') {
  const p = {
    partnerCode: 'TESTPARTNER',
    orderId,
    requestId: orderId,
    amount: String(amount),
    orderInfo: 'Thanh toan',
    orderType: 'momo_wallet',
    transId: '4100000001',
    resultCode: String(resultCode),
    message: resultCode === 0 ? 'Thành công.' : 'Giao dịch bị từ chối',
    payType: 'qr',
    responseTime: '1790000000000',
    extraData: ''
  };
  return { ...p, signature: momo.resultSignature(p, { accessKey: 'TESTACCESS', secretKey: secret }) };
}
const toQuery = (o) => '?' + new URLSearchParams(o).toString();

describe('Thanh toán MoMo', () => {
  test('TC-111: Tạo link thanh toán MoMo: đúng số tiền, có chữ ký hợp lệ, mỗi lần thử 1 mã giao dịch mới', async () => {
    const ctx = await setup();
    const order = await placeMomoOrder(ctx);
    const res = await auth(request(app).post(`/api/payments/momo/${order._id}`), ctx.token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.paymentUrl).toMatch(/^https:\/\/test-payment\.momo\.vn\//);
    const body = createCalls[0];
    expect(body).toMatchObject({ partnerCode: 'TESTPARTNER', accessKey: 'TESTACCESS', amount: String(order.grandTotal), requestType: 'payWithMethod' });
    expect(body.ipnUrl).toMatch(/\/api\/payments\/momo\/ipn$/);
    // Chữ ký đúng theo công thức của MoMo
    const raw = `accessKey=TESTACCESS&amount=${body.amount}&extraData=&ipnUrl=${body.ipnUrl}&orderId=${body.orderId}&orderInfo=${body.orderInfo}&partnerCode=TESTPARTNER&redirectUrl=${body.redirectUrl}&requestId=${body.requestId}&requestType=payWithMethod`;
    expect(body.signature).toBe(require('crypto').createHmac('sha256', 'TESTSECRET').update(raw).digest('hex'));

    await auth(request(app).post(`/api/payments/momo/${order._id}`), ctx.token);
    expect(createCalls[1].orderId).not.toBe(body.orderId);
    expect((await Order.findById(order._id)).paymentInfo.txnRefs).toHaveLength(2);
  });

  test('TC-112: Kết quả thành công (trang trả về + IPN) -> "đã thanh toán", ghi 1 lần; sai chữ ký / sai số tiền bị từ chối', async () => {
    const ctx = await setup();
    const order = await placeMomoOrder(ctx);
    await auth(request(app).post(`/api/payments/momo/${order._id}`), ctx.token);
    const ref = createCalls[0].orderId;

    const forged = { ...momoResult(ref, order.grandTotal), resultCode: '0', signature: momoResult(ref, order.grandTotal, 0, 'SAI').signature };
    expect((await request(app).get(`/api/payments/momo/return${toQuery(forged)}`)).statusCode).toBe(400);
    expect((await request(app).post('/api/payments/momo/ipn').send(momoResult(ref, 1000))).statusCode).toBe(400); // sai số tiền
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');

    const ret = await request(app).get(`/api/payments/momo/return${toQuery(momoResult(ref, order.grandTotal))}`);
    expect(ret.statusCode).toBe(200);
    expect(ret.body.data).toMatchObject({ success: true, paymentStatus: 'paid', paymentMode: 'momo' });
    const ipn = await request(app).post('/api/payments/momo/ipn').send(momoResult(ref, order.grandTotal));
    expect(ipn.statusCode).toBe(204);
    const saved = await Order.findById(order._id);
    expect(saved.paymentStatus).toBe('paid');
    expect(saved.paymentInfo).toMatchObject({ transactionNo: '4100000001', bankCode: 'qr', responseCode: '0' });
    await flushEmails();
  });

  test('TC-113: Thanh toán thất bại -> thanh toán lại được; đơn chưa thanh toán không được xác nhận; khách khác không tạo link được', async () => {
    const ctx = await setup();
    const order = await placeMomoOrder(ctx);
    await auth(request(app).post(`/api/payments/momo/${order._id}`), ctx.token);
    await request(app).post('/api/payments/momo/ipn').send(momoResult(createCalls[0].orderId, order.grandTotal, 1006));
    expect((await Order.findById(order._id)).paymentStatus).toBe('failed');

    // Admin không xác nhận được đơn MoMo chưa thanh toán
    await Admin.create({ name: 'Admin', email: 'admin-momo@example.com', password: 'admin123', role: 'admin' });
    const admin = (await request(app).post('/api/auth/login').send({ email: 'admin-momo@example.com', password: 'admin123' })).body.accessToken;
    const confirm = await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: 'confirmed' });
    expect(confirm.statusCode).toBe(400);
    expect(confirm.body.message).toMatch(/MoMo chưa được thanh toán/);

    // Thanh toán lại thành công
    await auth(request(app).post(`/api/payments/momo/${order._id}`), ctx.token);
    await request(app).post('/api/payments/momo/ipn').send(momoResult(createCalls[1].orderId, order.grandTotal));
    expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
    expect((await auth(request(app).put(`/api/orders/${order._id}/status`), admin).send({ status: 'confirmed' })).statusCode).toBe(200);

    const other = (await registerUser({ email: 'khac-momo@example.com', phoneNumber: '0987000111' })).body.accessToken;
    expect((await auth(request(app).post(`/api/payments/momo/${order._id}`), other)).statusCode).toBe(404);
    await flushEmails();
  });

  test('TC-114: Đơn vượt 50.000.000đ không tạo được link MoMo; đơn MoMo quá hạn tự hủy và trả lại tồn kho', async () => {
    const big = await setup(60000000);
    const bigOrder = await placeMomoOrder(big);
    const res = await auth(request(app).post(`/api/payments/momo/${bigOrder._id}`), big.token);
    expect(res.statusCode).toBe(502);
    expect(res.body.message).toMatch(/50\.000\.000/);
    expect(createCalls).toHaveLength(0); // chặn trước khi gọi MoMo

    const mongoose = require('mongoose');
    await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(bigOrder._id) }, { $set: { createdAt: new Date(Date.now() - 45 * 60000) } });
    expect((await StoreInventory.findOne()).stock).toBe(4);
    expect(await expireUnpaidOnlineOrders({ restoreStock })).toBe(1);
    const cancelled = await Order.findById(bigOrder._id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toMatch(/Quá hạn thanh toán MoMo/);
    expect((await StoreInventory.findOne()).stock).toBe(5);
    await flushEmails();
  });

  test('TC-115: Cấu hình MoMo trong trang quản trị: Secret Key mã hóa, không trả về; bật/tắt ảnh hưởng trang thanh toán; không xóa cấu hình VNPay', async () => {
    Object.keys(KEYS).forEach((k) => delete process.env[k]);
    momo.clearMomoConfigCache();
    await Admin.create({ name: 'Admin', email: 'admin-cfg@example.com', password: 'admin123', role: 'admin' });
    const token = (await request(app).post('/api/auth/login').send({ email: 'admin-cfg@example.com', password: 'admin123' })).body.accessToken;
    expect((await request(app).get('/api/payments/methods')).body.momo).toBe(false);

    await auth(request(app).put('/api/settings/payment'), token).send({ vnpayMode: 'custom', vnpTmnCode: 'VNP12345', vnpHashSecret: 'VNPSECRET' });
    const saved = await auth(request(app).put('/api/settings/payment/momo'), token).send({
      momoMode: 'custom',
      momoPartnerCode: 'MOMOTEST',
      momoAccessKey: 'ACCESS123',
      momoSecretKey: 'BIMAT_MOMO_XYZ'
    });
    expect(saved.statusCode).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain('BIMAT_MOMO_XYZ');
    expect(saved.body.data).toMatchObject({ momoMode: 'custom', momoPartnerCode: 'MOMOTEST', hasSecretKey: true });
    const doc = await PaymentConfig.findOne().lean();
    expect(doc.momoSecretKeyEnc).not.toContain('BIMAT_MOMO_XYZ');
    expect(doc.vnpTmnCode).toBe('VNP12345'); // cấu hình VNPay vẫn còn
    expect(await momo.getConfig()).toMatchObject({ partnerCode: 'MOMOTEST', secretKey: 'BIMAT_MOMO_XYZ' });
    expect((await request(app).get('/api/payments/methods')).body).toMatchObject({ vnpay: true, momo: true });

    // Lưu lại VNPay không xóa MoMo
    await auth(request(app).put('/api/settings/payment'), token).send({ vnpayMode: 'custom', vnpTmnCode: 'VNP99999' });
    expect((await PaymentConfig.findOne().lean()).momoPartnerCode).toBe('MOMOTEST');

    expect((await auth(request(app).put('/api/settings/payment/momo'), token).send({ momoMode: 'custom', momoPartnerCode: 'X' })).statusCode).toBe(400);
    await auth(request(app).put('/api/settings/payment/momo'), token).send({ momoMode: 'off' });
    expect((await request(app).get('/api/payments/methods')).body.momo).toBe(false);

    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).get('/api/settings/payment/momo'), customer)).statusCode).toBe(403);
  });
});
