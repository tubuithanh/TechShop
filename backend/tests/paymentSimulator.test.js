// Cổng thanh toán GIẢ LẬP VNPay / MoMo: trọn luồng thanh toán + hoàn tiền mà không gọi cổng thật
require('./setup');
const request = require('supertest');
const app = require('../app');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const vnpay = require('../utils/vnpay');
const momo = require('../utils/momo');
const { registerUser } = require('./helpers');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
let fetchSpy;
beforeEach(() => {
  vnpay.clearPaymentConfigCache();
  momo.clearMomoConfigCache();
  // Giả lập không được gọi ra ngoài
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => { throw new Error('Không được gọi mạng ở chế độ giả lập'); });
});
afterEach(() => jest.restoreAllMocks());

async function setup(paymentMode) {
  await Admin.create({ name: 'Admin', email: 'adminsim@example.com', password: 'admin123', role: 'admin' });
  const admin = (await request(app).post('/api/auth/login').send({ email: 'adminsim@example.com', password: 'admin123' })).body.accessToken;
  const category = await Category.create({ name: 'ĐT', slug: `dt-${paymentMode}` });
  const product = await Product.create({ title: 'Máy giả lập', slug: `may-sim-${paymentMode}`, categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1500000 }] });
  const store = await Store.create({ name: `CN Sim ${paymentMode}` });
  await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: 5 });
  const customer = (await registerUser()).body.accessToken;
  await auth(request(app).post('/api/cart/items'), customer).send({ productId: product._id, variantId: product.variants[0]._id, quantity: 1 });
  const order = (await auth(request(app).post('/api/orders'), customer).send({
    storeId: store._id, deliveryMethod: 'store_pickup', paymentMode, deliveryAddress: { fullName: 'Khách Sim', phone: '0900000000' }
  })).body.data;
  return { admin, customer, order };
}
// Tách đường dẫn + query của link tuyệt đối để gọi qua supertest
const pathOf = (url) => { const u = new URL(url); return `${u.pathname}${u.search}`; };

describe('Cổng thanh toán giả lập', () => {
  test('SIM-1: VNPay giả lập: link tới trang giả, chống sửa link, thanh toán thành công -> đơn đã thanh toán; hoàn tiền giả lập', async () => {
    const c = await setup('vnpay');
    // Chưa bật giả lập -> trang giả không hoạt động
    expect((await request(app).get('/api/payments/simulator/vnpay')).statusCode).toBe(404);

    const cfg = await auth(request(app).put('/api/settings/payment'), c.admin).send({ vnpayMode: 'simulator' });
    expect(cfg.statusCode).toBe(200);
    expect((await auth(request(app).post('/api/settings/payment/test'), c.admin).send({ vnpayMode: 'simulator' })).body.ok).toBe(true);
    expect((await request(app).get('/api/payments/methods')).body.vnpay).toBe(true);

    const start = await auth(request(app).post(`/api/payments/vnpay/${c.order._id}`), c.customer);
    expect(start.statusCode).toBe(200);
    const link = start.body.data.paymentUrl;
    expect(link).toContain('/api/payments/simulator/vnpay?');
    const page = await request(app).get(pathOf(link));
    expect(page.statusCode).toBe(200);
    expect(page.text).toContain('MÔI TRƯỜNG GIẢ LẬP');
    expect(page.text).toContain('1.500.000');
    // Cho phép form chuyển về trang kết quả ở frontend (khác domain), vẫn chặn script
    expect(page.headers['content-security-policy']).toContain("form-action 'self' http: https:");
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");

    // Sửa số tiền trên link -> chữ ký sai
    expect((await request(app).get(pathOf(link).replace('vnp_Amount=150000000', 'vnp_Amount=100'))).statusCode).toBe(400);

    const q = new URL(link).search.slice(1);
    const done = await request(app).post('/api/payments/simulator/vnpay/complete').type('form').send({ q, result: 'success' });
    expect(done.statusCode).toBe(303);
    expect(done.headers.location).toMatch(/^http:\/\/localhost:5173\/payment\/vnpay-return\?.*vnp_ResponseCode=00.*vnp_SecureHash=/);
    let order = await Order.findById(c.order._id).lean();
    expect(order.paymentStatus).toBe('paid');
    expect(order.paymentInfo.transactionNo).toMatch(/^\d{8}$/);

    // Trang kết quả của khách gửi lại query -> chữ ký hợp lệ (đã ghi nhận trước đó)
    const ret = await request(app).get(`/api/payments/vnpay/return${new URL(done.headers.location).search}`);
    expect(ret.statusCode).toBe(200);

    // Hủy đơn -> hoàn tiền qua VNPay (giả lập) thành công, không gọi mạng
    expect((await auth(request(app).put(`/api/orders/${c.order._id}/cancel`), c.customer).send({ reason: 'Đổi ý' })).statusCode).toBe(200);
    const refund = await auth(request(app).post(`/api/orders/${c.order._id}/confirm-refund`), c.admin).send({ confirmed: true, method: 'gateway' });
    expect(refund.statusCode).toBe(200);
    expect(refund.body.data).toMatchObject({ paymentStatus: 'refunded', refundInfo: { method: 'gateway', gateway: 'vnpay' } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('SIM-2: MoMo giả lập: thanh toán thất bại -> đơn chưa thanh toán; thanh toán lại thành công', async () => {
    const c = await setup('momo');
    expect((await auth(request(app).put('/api/settings/payment/momo'), c.admin).send({ momoMode: 'simulator' })).statusCode).toBe(200);

    const pay = async (result) => {
      const link = (await auth(request(app).post(`/api/payments/momo/${c.order._id}`), c.customer)).body.data.paymentUrl;
      expect(link).toContain('/api/payments/simulator/momo?');
      expect((await request(app).get(pathOf(link))).text).toContain('MoMo');
      return request(app).post('/api/payments/simulator/momo/complete').type('form').send({ q: new URL(link).search.slice(1), result });
    };
    const fail = await pay('fail');
    expect(fail.statusCode).toBe(303);
    expect(fail.headers.location).toContain('resultCode=1006');
    expect((await Order.findById(c.order._id)).paymentStatus).toBe('failed');

    const ok = await pay('success');
    expect(ok.headers.location).toContain('resultCode=0');
    expect((await Order.findById(c.order._id)).paymentStatus).toBe('paid');
    // Link bị sửa redirectUrl sang trang lạ -> từ chối
    const forged = await request(app).get('/api/payments/simulator/momo?orderId=X&amount=1&redirectUrl=https%3A%2F%2Fevil.example&signature=abc');
    expect(forged.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
