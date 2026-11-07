require('./setup');
const request = require('supertest');
const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreInventory = require('../models/StoreInventory');
const Order = require('../models/Order');
const { registerUser } = require('./helpers');
const { expireUnpaidVnpayOrders } = require('../utils/expireUnpaidOrders');
const { restoreStock } = require('../controllers/orderController');
const { flushEmails } = require('../utils/notifyEmail');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function productWithStores(stocks) {
  const category = await Category.create({ name: 'Điện thoại', slug: 'dien-thoai' });
  const product = await Product.create({ title: 'Máy test', slug: 'may-test', categoryId: category._id, price: 1, variants: [{ color: 'Đen', price: 1000000 }] });
  const stores = [];
  for (const [i, s] of stocks.entries()) {
    const store = await Store.create({ name: `Chi nhánh ${i + 1}`, isActive: s.active !== false });
    await StoreInventory.create({ storeId: store._id, productId: product._id, variantId: product.variants[0]._id, stock: s.stock });
    stores.push(store);
  }
  return { product, variant: product.variants[0], stores };
}

describe('Độ ổn định và an toàn nghiệp vụ', () => {
  test('TC-73: Giới hạn phân trang: limit quá lớn bị giới hạn 200, page/limit không hợp lệ không gây lỗi', async () => {
    const big = await request(app).get('/api/products?limit=1000000');
    expect(big.statusCode).toBe(200);
    const weird = await request(app).get('/api/products?limit=abc&page=-5');
    expect(weird.statusCode).toBe(200);
    const injected = await request(app).get('/api/products?limit[$gt]=0&page[$ne]=1');
    expect(injected.statusCode).toBe(200);
  });

  test('TC-74: Đổi mật khẩu -> thiết bị khác bị đăng xuất, thiết bị hiện tại nhận token mới; đặt lại mật khẩu cũng vậy', async () => {
    const email = 'doi-mk@example.com';
    const oldToken = (await registerUser({ email, password: 'matkhau123' })).body.accessToken;
    const otherDevice = (await request(app).post('/api/auth/login').send({ email, password: 'matkhau123' })).body.accessToken;
    const res = await auth(request(app).put('/api/auth/change-password'), oldToken).send({ oldPassword: 'matkhau123', newPassword: 'moimoi123' });
    expect(res.statusCode).toBe(200);
    expect((await auth(request(app).get('/api/auth/me'), otherDevice)).statusCode).toBe(401);
    expect((await auth(request(app).get('/api/auth/me'), res.body.accessToken)).statusCode).toBe(200);

    // Quên mật khẩu -> đặt lại -> token đang dùng hết hiệu lực
    const current = res.body.accessToken;
    const otp = await request(app).post('/api/auth/password/request-otp').send({ email });
    await request(app).post('/api/auth/password/reset').send({ email, code: otp.body.devOtpPreview, newPassword: 'lanba12345', confirmPassword: 'lanba12345' });
    expect((await auth(request(app).get('/api/auth/me'), current)).statusCode).toBe(401);
  });

  test('TC-75: Giới hạn tần suất xin mã OTP đăng ký: quá 10 lần/15 phút -> 429', async () => {
    process.env.RATE_LIMIT_DISABLED = 'false';
    try {
      let last;
      for (let i = 0; i < 11; i++) {
        last = await request(app).post('/api/auth/register/request-otp').send({ email: `spam${i}@example.com` });
      }
      expect(last.statusCode).toBe(429);
    } finally {
      process.env.RATE_LIMIT_DISABLED = 'true';
    }
  });

  test('TC-76: Giỏ hàng tính theo chi nhánh còn nhiều hàng nhất (không cộng dồn), bỏ qua chi nhánh đã đóng', async () => {
    const { product, variant } = await productWithStores([{ stock: 2 }, { stock: 2 }, { stock: 9, active: false }]);
    const token = (await registerUser()).body.accessToken;
    const add = (quantity) => auth(request(app).post('/api/cart/items'), token).send({ productId: product._id, variantId: variant._id, quantity });
    expect((await add(3)).statusCode).toBe(400); // 2 + 2 = 4 nhưng không chi nhánh nào đủ 3
    const ok = await add(2);
    expect(ok.statusCode).toBe(201);
    expect(ok.body.data.items[0].stock).toBe(2);
  });

  test('TC-77: Đơn VNPay quá 30 phút chưa thanh toán -> tự hủy, trả tồn kho; đơn đã thanh toán / còn hạn giữ nguyên', async () => {
    const { product, variant, stores } = await productWithStores([{ stock: 5 }]);
    const token = (await registerUser()).body.accessToken;
    const place = async () => {
      await auth(request(app).post('/api/cart/items'), token).send({ productId: product._id, variantId: variant._id, quantity: 1 });
      return (await auth(request(app).post('/api/orders'), token).send({ storeId: stores[0]._id, deliveryMethod: 'store_pickup', paymentMode: 'vnpay', deliveryAddress: { fullName: 'A', phone: '0912345678' } })).body.data;
    };
    const expired = await place();
    const paidOld = await place();
    const fresh = await place();
    const old = new Date(Date.now() - 45 * 60000);
    await Order.collection.updateMany({ _id: { $in: [expired, paidOld].map((o) => new Order({ _id: o._id })._id) } }, { $set: { createdAt: old } });
    await Order.updateOne({ _id: paidOld._id }, { paymentStatus: 'paid' });
    expect((await StoreInventory.findOne()).stock).toBe(2);

    // Đơn quá hạn không còn tạo được link thanh toán mới
    process.env.VNP_TMN_CODE = 'T';
    process.env.VNP_HASH_SECRET = 'S';
    expect((await auth(request(app).post(`/api/payments/vnpay/${expired._id}`), token)).statusCode).toBe(400);

    expect(await expireUnpaidVnpayOrders({ restoreStock })).toBe(1);
    await flushEmails();
    expect((await Order.findById(expired._id)).status).toBe('cancelled');
    expect((await Order.findById(paidOld._id)).status).toBe('pending');
    expect((await Order.findById(fresh._id)).status).toBe('pending');
    expect((await StoreInventory.findOne()).stock).toBe(3); // trả lại 1 máy
    expect(await expireUnpaidVnpayOrders({ restoreStock })).toBe(0); // chạy lại không hủy trùng
  });
});
