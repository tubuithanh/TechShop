require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const PaymentConfig = require('../models/PaymentConfig');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const vnpay = require('../utils/vnpay');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const ENV_KEYS = ['VNP_TMN_CODE', 'VNP_HASH_SECRET'];
let savedEnv;

async function adminToken() {
  await Admin.create({ name: 'Admin', email: 'admin-pay@example.com', password: 'admin123', role: 'admin' });
  return (await request(app).post('/api/auth/login').send({ email: 'admin-pay@example.com', password: 'admin123' })).body.accessToken;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  vnpay.clearPaymentConfigCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => (savedEnv[k] === undefined ? delete process.env[k] : (process.env[k] = savedEnv[k])));
  jest.restoreAllMocks();
});

describe('Cấu hình thanh toán VNPay trong trang quản trị', () => {
  test('TC-85: Admin lưu Terminal ID + Secret Key -> Secret Key được mã hóa, không trả về trình duyệt; VNPay bật', async () => {
    const token = await adminToken();
    expect((await request(app).get('/api/payments/vnpay/status')).body.enabled).toBe(false);

    const missing = await auth(request(app).put('/api/settings/payment'), token).send({ vnpayMode: 'custom', vnpTmnCode: 'ABC12345' });
    expect(missing.statusCode).toBe(400); // thiếu Secret Key

    const res = await auth(request(app).put('/api/settings/payment'), token).send({
      vnpayMode: 'custom',
      vnpTmnCode: 'ABC12345',
      vnpHashSecret: 'BIMAT_VNPAY_123'
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('BIMAT_VNPAY_123');
    expect(res.body.data).toMatchObject({ vnpayMode: 'custom', vnpTmnCode: 'ABC12345', hasHashSecret: true });
    const doc = await PaymentConfig.findOne().lean();
    expect(doc.vnpHashSecretEnc).toBeTruthy();
    expect(doc.vnpHashSecretEnc).not.toContain('BIMAT_VNPAY_123');

    expect((await request(app).get('/api/payments/vnpay/status')).body.enabled).toBe(true);
    const cfg = await vnpay.getConfig();
    expect(cfg).toMatchObject({ source: 'custom', tmnCode: 'ABC12345', hashSecret: 'BIMAT_VNPAY_123' });

    // Để trống Secret Key khi lưu lại -> giữ Secret Key cũ
    await auth(request(app).put('/api/settings/payment'), token).send({ vnpayMode: 'custom', vnpTmnCode: 'XYZ98765' });
    expect(await vnpay.getConfig()).toMatchObject({ tmnCode: 'XYZ98765', hashSecret: 'BIMAT_VNPAY_123' });

    // Tắt -> không tạo được link thanh toán
    await auth(request(app).put('/api/settings/payment'), token).send({ vnpayMode: 'off' });
    expect((await request(app).get('/api/payments/vnpay/status')).body.enabled).toBe(false);
  });

  test('TC-86: Link thanh toán ký bằng Secret Key trong trang quản trị; chữ ký VNPay gửi về được kiểm tra đúng', async () => {
    const token = await adminToken();
    await auth(request(app).put('/api/settings/payment'), token).send({ vnpayMode: 'custom', vnpTmnCode: 'ABC12345', vnpHashSecret: 'SECRET_A' });

    const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
    const product = await Product.create({ title: 'Máy', slug: 'may', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 500000 }] });
    const store = await Store.create({ name: 'CN1', isActive: true });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
    const customer = (await registerUser()).body.accessToken;
    await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
    const order = (
      await auth(request(app).post('/api/orders'), customer).send({
        storeId: store._id,
        deliveryMethod: 'store_pickup',
        paymentMode: 'vnpay',
        deliveryAddress: { fullName: 'A', phone: '0912345678' }
      })
    ).body.data;

    const pay = await auth(request(app).post(`/api/payments/vnpay/${order._id}`), customer);
    expect(pay.statusCode).toBe(200);
    const url = new URL(pay.body.data?.paymentUrl || pay.body.paymentUrl);
    expect(url.searchParams.get('vnp_TmnCode')).toBe('ABC12345');
    const params = Object.fromEntries(url.searchParams);
    const { vnp_SecureHash, ...rest } = params;
    expect(vnp_SecureHash).toBe(vnpay.signedQuery(rest, 'SECRET_A').hash);

    // Dữ liệu VNPay gửi về ký bằng Secret Key cũ/sai -> bị từ chối
    const back = { ...rest, vnp_ResponseCode: '00', vnp_TransactionStatus: '00' };
    expect(await vnpay.verifyReturn({ ...back, vnp_SecureHash: vnpay.signedQuery(back, 'SAI').hash })).toBeNull();
    expect(await vnpay.verifyReturn({ ...back, vnp_SecureHash: vnpay.signedQuery(back, 'SECRET_A').hash })).toMatchObject({ success: true });
  });

  test('TC-87: Kiểm tra kết nối báo đúng lỗi Terminal ID / Secret Key; khách hàng không xem được cấu hình', async () => {
    const token = await adminToken();
    const customer = (await registerUser()).body.accessToken;
    expect((await auth(request(app).get('/api/settings/payment'), customer)).statusCode).toBe(403);

    const reply = (location) =>
      jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
    const test = () =>
      auth(request(app).post('/api/settings/payment/test'), token).send({ vnpayMode: 'custom', vnpTmnCode: 'ABC12345', vnpHashSecret: 'X' });

    reply('/paymentv2/Payment/Error.html?code=72');
    let res = await test();
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Terminal ID/);

    reply('/paymentv2/Payment/Error.html?code=70');
    res = await test();
    expect(res.body.message).toMatch(/Secret Key/);

    reply('/paymentv2/Transaction/PaymentMethod.html?token=abc');
    res = await test();
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
